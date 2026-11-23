package db

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/secure"
)

type MCPToken struct {
	ID                 string                `json:"id"`
	Name               string                `json:"name"`
	OwnerID            *string               `json:"ownerId"`
	OwnerName          *string               `json:"ownerName"`
	ProjectIDs         []string              `json:"projectIds"`
	ProjectPermissions MCPProjectPermissions `json:"projectPermissions"`
	CreatedAt          time.Time             `json:"createdAt"`
	ExpiresAt          time.Time             `json:"expiresAt"`
	RevokedAt          *time.Time            `json:"revokedAt,omitempty"`
}

type MCPProject struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	TeamName string `json:"teamName"`
	CanWrite bool   `json:"canWrite"`
}

type MCPProjectPermissions map[string][]string

const (
	MCPConfigure   = "configure"
	MCPLifecycle   = "lifecycle"
	MCPFreshDeploy = "freshDeploy"
	MCPCleanup     = "cleanup"
)

var ErrMCPProject = errors.New("select projects you can access")
var ErrMCPNoProjects = errors.New("token has no projects")

// Match Store.Access for project reads. Use the current user row and project
// memberships in the same query as the protected data.
const mcpReadableProject = `p.kind='project' AND p.data->'deleting' IS DISTINCT FROM 'true'::jsonb
	AND NOT u.disabled AND (u.admin OR (p.team_id<>'' AND (
		EXISTS (SELECT 1 FROM team_members WHERE team_id=p.team_id AND user_id=u.id AND role='owner')
		OR EXISTS (SELECT 1 FROM project_members WHERE project_id=p.id AND user_id=u.id)
	)))`

const mcpWritableProject = `(u.admin OR (p.team_id<>'' AND (
	EXISTS (SELECT 1 FROM team_members WHERE team_id=p.team_id AND user_id=u.id AND role='owner')
	OR EXISTS (SELECT 1 FROM project_members WHERE project_id=p.id AND user_id=u.id AND role IN ('owner','operator'))
)))`

const mcpAuthorizedProjects = `SELECT p.id,p.name,p.team_id,token.id AS token_id,
	CASE WHEN ` + mcpWritableProject + ` THEN scope.permissions ELSE ARRAY[]::text[] END AS permissions
	FROM mcp_tokens AS token
	JOIN users u ON u.id=token.owner_id
	JOIN mcp_token_projects AS scope ON scope.token_id=token.id
	JOIN resources p ON p.id=scope.project_id
	WHERE token.token_hash=$1 AND token.revoked_at IS NULL AND token.expires_at>now()
	AND ` + mcpReadableProject

const mcpTokenProjectIDs = `ARRAY(
	SELECT p.id FROM mcp_token_projects AS scope JOIN resources p ON p.id=scope.project_id
	WHERE scope.token_id=mcp_tokens.id AND ` + mcpReadableProject + ` ORDER BY p.id)`

const mcpTokenPermissions = `COALESCE((
	SELECT jsonb_object_agg(p.id,scope.permissions)
	FROM mcp_token_projects AS scope JOIN resources p ON p.id=scope.project_id
	WHERE scope.token_id=mcp_tokens.id AND cardinality(scope.permissions)>0
	AND ` + mcpReadableProject + ` AND ` + mcpWritableProject + `),'{}'::jsonb)`

// The caller supplies only the signed-in user's ID. Read their current status
// and admin role in the database when authorizing each operation.
const mcpOwner = `owner_id=$1 AND EXISTS (SELECT 1 FROM users WHERE id=$1 AND NOT disabled)`
const mcpManager = `EXISTS (SELECT 1 FROM users actor
	WHERE actor.id=$1 AND NOT actor.disabled AND (actor.admin OR actor.id=mcp_tokens.owner_id))`

func (s *Store) IssueMCPToken(ctx context.Context, owner, name string, projects []string, days int) (MCPToken, string, error) {
	return s.IssueMCPTokenWithPermissions(ctx, owner, name, projects, nil, days)
}

func (s *Store) IssueMCPTokenWithPermissions(ctx context.Context, owner, name string, projects []string, permissions MCPProjectPermissions, days int) (MCPToken, string, error) {
	if permissions == nil {
		permissions = MCPProjectPermissions{}
	}
	token := MCPToken{ID: uuid.NewString(), Name: name, OwnerID: &owner, ProjectIDs: projects, ProjectPermissions: permissions}
	secret := "syd_mcp_" + secure.Token()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return token, "", err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `INSERT INTO mcp_tokens(id,name,token_hash,expires_at,owner_id)
		SELECT $1,$2,$3,now()+make_interval(days => $4),id FROM users WHERE id=$5 AND NOT disabled
		RETURNING created_at,expires_at,(SELECT name FROM users WHERE id=$5)`,
		token.ID, name, secure.Hash(secret), days, owner).Scan(&token.CreatedAt, &token.ExpiresAt, &token.OwnerName)
	if err != nil {
		return token, "", err
	}
	if err := insertMCPTokenProjects(ctx, tx, token.ID, projects, permissions); err != nil {
		return token, "", err
	}
	if err := auditMCPTokenProjects(ctx, tx, owner, "mcp.token_issued", token.ID, projects, permissions); err != nil {
		return token, "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return token, "", err
	}
	return token, secret, nil
}

func insertMCPTokenProjects(ctx context.Context, tx pgx.Tx, id string, projects []string, permissions MCPProjectPermissions) error {
	inserted, err := tx.Exec(ctx, `INSERT INTO mcp_token_projects(token_id,project_id,permissions)
		SELECT $1,p.id,grants.permissions FROM mcp_tokens token JOIN users u ON u.id=token.owner_id
		JOIN resources p ON p.id=ANY($2)
		CROSS JOIN LATERAL (SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE($3::jsonb->p.id,'[]'::jsonb))) AS permissions) grants
		WHERE token.id=$1 AND `+mcpReadableProject+` AND (cardinality(grants.permissions)=0 OR `+mcpWritableProject+`)`,
		id, projects, permissions)
	if err != nil {
		return err
	}
	if inserted.RowsAffected() != int64(len(projects)) {
		return ErrMCPProject
	}
	return nil
}

func auditMCPTokenProjects(ctx context.Context, tx pgx.Tx, actor, action, id string, projects []string, permissions MCPProjectPermissions) error {
	detail, err := json.Marshal(map[string]any{"projectIds": projects, "projectPermissions": permissions})
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "INSERT INTO audit(user_id,action,resource_id,detail) VALUES($1,$2,$3,$4)", actor, action, id, detail)
	return err
}

func (s *Store) UpdateMCPTokenAccess(ctx context.Context, owner, id string, projects []string, permissions MCPProjectPermissions) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// Serialize changes to the project set with recreation, revocation, and deletion.
	if err := tx.QueryRow(ctx, "SELECT id FROM mcp_tokens WHERE id=$2 AND "+mcpOwner+" FOR UPDATE", owner, id).Scan(&id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM mcp_token_projects WHERE token_id=$1", id); err != nil {
		return err
	}
	if err := insertMCPTokenProjects(ctx, tx, id, projects, permissions); err != nil {
		return err
	}
	if err := auditMCPTokenProjects(ctx, tx, owner, "mcp.token_access_updated", id, projects, permissions); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) RecreateMCPToken(ctx context.Context, owner, id string, days int) (MCPToken, string, error) {
	token := MCPToken{ID: id, OwnerID: &owner}
	secret := "syd_mcp_" + secure.Token()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return token, "", err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `UPDATE mcp_tokens SET token_hash=$3,expires_at=clock_timestamp()+make_interval(days => $4),revoked_at=NULL
		WHERE id=$2 AND `+mcpOwner+` RETURNING name,created_at,expires_at`,
		owner, id, secure.Hash(secret), days).Scan(&token.Name, &token.CreatedAt, &token.ExpiresAt)
	if err != nil {
		return token, "", err
	}
	// Read the latest grants after acquiring the token lock in the update.
	if err := tx.QueryRow(ctx, `SELECT u.name,`+mcpTokenProjectIDs+`,`+mcpTokenPermissions+` FROM mcp_tokens
		JOIN users u ON u.id=mcp_tokens.owner_id WHERE mcp_tokens.id=$1`, id).Scan(&token.OwnerName, &token.ProjectIDs, &token.ProjectPermissions); err != nil {
		return token, "", err
	}
	if len(token.ProjectIDs) == 0 {
		return token, "", ErrMCPNoProjects
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit(user_id,action,resource_id,detail)
		VALUES($1,'mcp.token_recreated',$2,jsonb_build_object('expiresAt',$3::timestamptz))`, owner, id, token.ExpiresAt)
	if err != nil {
		return token, "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return token, "", err
	}
	return token, secret, nil
}

func (s *Store) MCPTokenID(ctx context.Context, hash string) (string, error) {
	var id string
	err := s.Pool.QueryRow(ctx, `SELECT token_id FROM (`+mcpAuthorizedProjects+`) scope LIMIT 1`, hash).Scan(&id)
	return id, err
}

func (s *Store) MCPTokens(ctx context.Context, actor string) ([]MCPToken, error) {
	rows, err := s.Pool.Query(ctx, `SELECT mcp_tokens.id,mcp_tokens.name,owner_id,u.name,mcp_tokens.created_at,expires_at,revoked_at,`+mcpTokenProjectIDs+`,`+mcpTokenPermissions+`
		FROM mcp_tokens LEFT JOIN users u ON u.id=mcp_tokens.owner_id
		WHERE `+mcpManager+` ORDER BY mcp_tokens.created_at DESC,mcp_tokens.id DESC`, actor)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tokens := []MCPToken{}
	for rows.Next() {
		var token MCPToken
		if err := rows.Scan(&token.ID, &token.Name, &token.OwnerID, &token.OwnerName, &token.CreatedAt, &token.ExpiresAt, &token.RevokedAt, &token.ProjectIDs, &token.ProjectPermissions); err != nil {
			return nil, err
		}
		tokens = append(tokens, token)
	}
	return tokens, rows.Err()
}

func (s *Store) MCPProjects(ctx context.Context, actor string) ([]MCPProject, error) {
	rows, err := s.Pool.Query(ctx, `SELECT p.id,p.name,COALESCE(t.name,''),`+mcpWritableProject+` FROM resources p
		LEFT JOIN resources t ON t.id=p.team_id AND t.kind='team'
		JOIN users u ON u.id=$1 WHERE `+mcpReadableProject+` ORDER BY t.name,p.name,p.id`, actor)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	projects := []MCPProject{}
	for rows.Next() {
		var project MCPProject
		if err := rows.Scan(&project.ID, &project.Name, &project.TeamName, &project.CanWrite); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func (s *Store) RevokeMCPToken(ctx context.Context, actor, id string) error {
	var managed bool
	err := s.Pool.QueryRow(ctx, `WITH managed AS (
		SELECT id FROM mcp_tokens WHERE id=$2 AND `+mcpManager+` FOR UPDATE
	), revoked AS (
		UPDATE mcp_tokens SET revoked_at=now()
		WHERE id IN (SELECT id FROM managed) AND revoked_at IS NULL RETURNING id
	), audited AS (
		INSERT INTO audit(user_id,action,resource_id) SELECT $1,'mcp.token_revoked',id FROM revoked
	) SELECT EXISTS (SELECT 1 FROM managed)`, actor, id).Scan(&managed)
	if err == nil && !managed {
		return pgx.ErrNoRows
	}
	return err
}

func (s *Store) DeleteMCPToken(ctx context.Context, actor, id string) error {
	deleted, err := s.Pool.Exec(ctx, `WITH deleted AS (
		DELETE FROM mcp_tokens WHERE id=$2 AND `+mcpManager+` RETURNING id
	) INSERT INTO audit(user_id,action,resource_id) SELECT $1,'mcp.token_deleted',id FROM deleted`, actor, id)
	if err != nil {
		return err
	}
	if deleted.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
