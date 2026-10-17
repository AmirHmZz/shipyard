package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"shipyard/internal/secure"
)

func (a *API) members(w http.ResponseWriter, r *http.Request) {
	team, ok := a.get(w, r, false)
	if !ok {
		return
	}
	if team.Kind != "team" {
		fail(w, 400, "Team required")
		return
	}
	rows, e := a.Store.Pool.Query(r.Context(), "SELECT u.id,u.email,u.name,m.role FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 ORDER BY u.name", team.ID)
	if e != nil {
		a.err(w, e)
		return
	}
	defer rows.Close()
	out := []map[string]string{}
	for rows.Next() {
		var id, email, name, role string
		if rows.Scan(&id, &email, &name, &role) == nil {
			out = append(out, map[string]string{"id": id, "email": email, "name": name, "role": role})
		}
	}
	respond(w, 200, out)
}
func (a *API) invite(w http.ResponseWriter, r *http.Request) {
	team, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if team.Kind != "team" || !user(r).Admin && !a.Store.TeamOwner(r.Context(), user(r).ID, team.ID) {
		fail(w, 403, "Team owner required")
		return
	}
	var in struct {
		Email     string `json:"email"`
		Role      string `json:"role"`
		ProjectID string `json:"projectId"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Email = normalizeEmail(in.Email)
	if !validEmail(in.Email) {
		fail(w, 400, "Valid email required")
		return
	}
	if in.ProjectID == "" {
		if in.Role != "owner" && in.Role != "member" {
			fail(w, 400, "Team role must be owner or member")
			return
		}
	} else {
		project, e := a.Store.Resource(r.Context(), in.ProjectID)
		if e != nil || project.Kind != "project" || project.TeamID != team.ID {
			fail(w, 400, "Project must belong to this team")
			return
		}
		if in.Role != "owner" && in.Role != "operator" && in.Role != "viewer" {
			fail(w, 400, "Invalid project role")
			return
		}
	}
	token := secure.Token()
	_, e := a.Store.Pool.Exec(r.Context(), "INSERT INTO invitations(id,token,email,team_id,project_id,role,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)", uuid.NewString(), secure.Hash(token), in.Email, team.ID, in.ProjectID, in.Role, time.Now().Add(48*time.Hour))
	if e != nil {
		a.err(w, e)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "invitation.created", team.ID, team.ID, map[string]string{"email": in.Email, "role": in.Role})
	respond(w, 201, map[string]string{"url": a.canonicalOrigin(r.Context()) + "/invite?token=" + token})
}
func (a *API) projectMember(w http.ResponseWriter, r *http.Request) {
	project, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if project.Kind != "project" || !user(r).Admin && !a.Store.TeamOwner(r.Context(), user(r).ID, project.TeamID) {
		fail(w, 403, "Team owner required")
		return
	}
	var in struct {
		UserID string `json:"userId"`
		Role   string `json:"role"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Role != "owner" && in.Role != "operator" && in.Role != "viewer" && in.Role != "remove" {
		fail(w, 400, "Invalid project role")
		return
	}
	var member bool
	_ = a.Store.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id=$1 AND user_id=$2)", project.TeamID, in.UserID).Scan(&member)
	if !member {
		fail(w, 400, "Add the user to the team first")
		return
	}
	var e error
	if in.Role == "remove" {
		_, e = a.Store.Pool.Exec(r.Context(), "DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", project.ID, in.UserID)
	} else {
		_, e = a.Store.Pool.Exec(r.Context(), "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(project_id,user_id) DO UPDATE SET role=$3", project.ID, in.UserID, in.Role)
	}
	if e != nil {
		a.err(w, e)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "project.member_changed", project.ID, project.TeamID, in)
	respond(w, 200, map[string]bool{"ok": true})
}
func (a *API) removeMember(w http.ResponseWriter, r *http.Request) {
	team, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if team.Kind != "team" || !user(r).Admin && !a.Store.TeamOwner(r.Context(), user(r).ID, team.ID) {
		fail(w, 403, "Team owner required")
		return
	}
	target := chi.URLParam(r, "user")
	if target == user(r).ID {
		fail(w, 409, "Another owner must remove your membership")
		return
	}
	tx, e := a.Store.Pool.Begin(r.Context())
	if e != nil {
		a.err(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	_, e = tx.Exec(r.Context(), "DELETE FROM project_members WHERE user_id=$1 AND project_id IN(SELECT id FROM resources WHERE kind='project' AND team_id=$2)", target, team.ID)
	if e != nil {
		a.err(w, e)
		return
	}
	_, e = tx.Exec(r.Context(), "DELETE FROM team_members WHERE team_id=$1 AND user_id=$2", team.ID, target)
	if e != nil {
		a.err(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		a.err(w, e)
		return
	}
	respond(w, 200, map[string]bool{"ok": true})
}
func (a *API) audit(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.Pool.Query(r.Context(), "SELECT id,user_id,action,resource_id,team_id,detail,created_at FROM audit ORDER BY created_at DESC LIMIT 500")
	if e != nil {
		a.err(w, e)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var uid, action, resource, team string
		var detail []byte
		var at time.Time
		if rows.Scan(&id, &uid, &action, &resource, &team, &detail, &at) == nil {
			if !user(r).Admin && !a.Store.TeamOwner(r.Context(), user(r).ID, team) {
				continue
			}
			out = append(out, map[string]any{"id": id, "userId": uid, "action": action, "resourceId": resource, "teamId": team, "at": at})
		}
	}
	respond(w, 200, out)
}
func (a *API) jobs(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	rows, e := a.Store.Pool.Query(r.Context(), "SELECT id,kind,resource_id,state,attempts,last_error,created_at FROM jobs WHERE kind NOT IN('metrics','notify') ORDER BY created_at DESC LIMIT 100")
	if e != nil {
		a.err(w, e)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, kind, resource, state, err string
		var attempts int
		var at time.Time
		if rows.Scan(&id, &kind, &resource, &state, &attempts, &err, &at) == nil {
			out = append(out, map[string]any{"id": id, "kind": kind, "resourceId": resource, "state": state, "attempts": attempts, "error": err, "createdAt": at})
		}
	}
	respond(w, 200, out)
}
