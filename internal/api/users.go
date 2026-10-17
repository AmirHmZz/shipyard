package api

import (
	"github.com/go-chi/chi/v5"
	"net/http"
	"shipyard/internal/secure"
)

func (a *API) users(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	rows, err := a.Store.Pool.Query(r.Context(), "SELECT id,email,name,admin,disabled,totp IS NOT NULL FROM users ORDER BY name")
	if err != nil {
		a.err(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, email, name string
		var admin, disabled, totp bool
		if err = rows.Scan(&id, &email, &name, &admin, &disabled, &totp); err != nil {
			a.err(w, err)
			return
		}
		out = append(out, map[string]any{"id": id, "email": email, "name": name, "admin": admin, "disabled": disabled, "totp": totp})
	}
	respond(w, 200, out)
}

func (a *API) updateUser(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	var in struct {
		Admin    bool `json:"admin"`
		Disabled bool `json:"disabled"`
	}
	if !decode(w, r, &in) {
		return
	}
	target := chi.URLParam(r, "id")
	tx, err := a.Store.Pool.Begin(r.Context())
	if err != nil {
		a.err(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), "SELECT pg_advisory_xact_lock(73914231)"); err != nil {
		a.err(w, err)
		return
	}
	var exists bool
	if err = tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE id=$1)", target).Scan(&exists); err != nil {
		a.err(w, err)
		return
	}
	if !exists {
		fail(w, 404, "User not found")
		return
	}
	if !in.Admin || in.Disabled {
		var others int
		_ = tx.QueryRow(r.Context(), "SELECT count(*) FROM users WHERE admin AND NOT disabled AND id<>$1", target).Scan(&others)
		if others == 0 {
			fail(w, 409, "Keep at least one active platform administrator")
			return
		}
	}
	if _, err = tx.Exec(r.Context(), "UPDATE users SET admin=$2,disabled=$3 WHERE id=$1", target, in.Admin, in.Disabled); err != nil {
		a.err(w, err)
		return
	}
	// Revocation takes effect immediately for requests and at the next stream check.
	if _, err = tx.Exec(r.Context(), "DELETE FROM sessions WHERE user_id=$1", target); err != nil {
		a.err(w, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		a.err(w, err)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "user.access_changed", target, "", in)
	respond(w, 200, map[string]bool{"ok": true})
}

func (a *API) changePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Current  string `json:"current"`
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	if !decode(w, r, &in) {
		return
	}
	u := user(r)
	if !a.limits.Allow("password:" + u.ID) {
		fail(w, 429, "Too many attempts; try again later")
		return
	}
	var encoded string
	var otp []byte
	err := a.Store.Pool.QueryRow(r.Context(), "SELECT password,totp FROM users WHERE id=$1", u.ID).Scan(&encoded, &otp)
	if err != nil || !secure.CheckPassword(in.Current, encoded) || len(otp) > 0 && !a.validateOTP(r.Context(), u.ID, otp, in.Code) {
		fail(w, 403, "Current password and enabled authenticator are required")
		return
	}
	hash, err := secure.Password(in.Password)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	tx, err := a.Store.Pool.Begin(r.Context())
	if err != nil {
		a.err(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), "UPDATE users SET password=$2 WHERE id=$1", u.ID, hash); err != nil {
		a.err(w, err)
		return
	}
	if _, err = tx.Exec(r.Context(), "DELETE FROM sessions WHERE user_id=$1", u.ID); err != nil {
		a.err(w, err)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		a.err(w, err)
		return
	}
	_ = a.Store.Audit(r.Context(), u.ID, "account.password_changed", u.ID, "", nil)
	a.newSession(w, r, u)
}
