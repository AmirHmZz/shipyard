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
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	ProjectIDs []string   `json:"projectIds"`
	CreatedAt  time.Time  `json:"createdAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	RevokedAt  *time.Time `json:"revokedAt,omitempty"`
}

type MCPProject struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	TeamName string `json:"teamName"`
}

var ErrMCPProject = errors.New("select existing projects")
var ErrMCPNoProjects = errors.New("token has no projects")

const mcpTokenProjectIDs = `ARRAY(SELECT project_id FROM mcp_token_projects WHERE token_id=mcp_tokens.id ORDER BY project_id)`

func (s *Store) IssueMCPToken(ctx context.Context, admin, name string, projects []string, days int) (MCPToken, string, error) {
	token := MCPToken{ID: uuid.NewString(), Name: name, ProjectIDs: projects}
	secret := "syd_mcp_" + secure.Token()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return token, "", err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `INSERT INTO mcp_tokens(id,name,token_hash,expires_at)
		VALUES($1,$2,$3,now()+make_interval(days => $4)) RETURNING created_at,expires_at`,
		token.ID, name, secure.Hash(secret), days).Scan(&token.CreatedAt, &token.ExpiresAt)
	if err != nil {
		return token, "", err
	}
	if err := insertMCPTokenProjects(ctx, tx, token.ID, projects); err != nil {
		return token, "", err
	}
	if err := auditMCPTokenProjects(ctx, tx, admin, "mcp.token_issued", token.ID, projects); err != nil {
		return token, "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return token, "", err
	}
	return token, secret, nil
}

func insertMCPTokenProjects(ctx context.Context, tx pgx.Tx, id string, projects []string) error {
	inserted, err := tx.Exec(ctx, `INSERT INTO mcp_token_projects(token_id,project_id)
		SELECT $1,id FROM resources WHERE kind='project' AND id=ANY($2) AND data->'deleting' IS DISTINCT FROM 'true'::jsonb`, id, projects)
	if err != nil {
		return err
	}
	if inserted.RowsAffected() != int64(len(projects)) {
		return ErrMCPProject
	}
	return nil
}

func auditMCPTokenProjects(ctx context.Context, tx pgx.Tx, admin, action, id string, projects []string) error {
	detail, err := json.Marshal(map[string][]string{"projectIds": projects})
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "INSERT INTO audit(user_id,action,resource_id,detail) VALUES($1,$2,$3,$4)", admin, action, id, detail)
	return err
}

func (s *Store) UpdateMCPTokenAccess(ctx context.Context, admin, id string, projects []string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// Serialize changes to the project set with recreation, revocation, and deletion.
	if err := tx.QueryRow(ctx, "SELECT id FROM mcp_tokens WHERE id=$1 FOR UPDATE", id).Scan(&id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM mcp_token_projects WHERE token_id=$1", id); err != nil {
		return err
	}
	if err := insertMCPTokenProjects(ctx, tx, id, projects); err != nil {
		return err
	}
	if err := auditMCPTokenProjects(ctx, tx, admin, "mcp.token_access_updated", id, projects); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) RecreateMCPToken(ctx context.Context, admin, id string, days int) (MCPToken, string, error) {
	token := MCPToken{ID: id}
	secret := "syd_mcp_" + secure.Token()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return token, "", err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `UPDATE mcp_tokens SET token_hash=$2,expires_at=clock_timestamp()+make_interval(days => $3),revoked_at=NULL
		WHERE id=$1 RETURNING name,created_at,expires_at`, id, secure.Hash(secret), days).Scan(&token.Name, &token.CreatedAt, &token.ExpiresAt)
	if err != nil {
		return token, "", err
	}
	// Read the latest grants after acquiring the token lock in the update.
	if err := tx.QueryRow(ctx, `SELECT `+mcpTokenProjectIDs+` FROM mcp_tokens WHERE id=$1`, id).Scan(&token.ProjectIDs); err != nil {
		return token, "", err
	}
	if len(token.ProjectIDs) == 0 {
		return token, "", ErrMCPNoProjects
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit(user_id,action,resource_id,detail)
		VALUES($1,'mcp.token_recreated',$2,jsonb_build_object('expiresAt',$3::timestamptz))`, admin, id, token.ExpiresAt)
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
	err := s.Pool.QueryRow(ctx, `SELECT id FROM mcp_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()
		AND EXISTS (SELECT 1 FROM mcp_token_projects WHERE token_id=mcp_tokens.id)`, hash).Scan(&id)
	return id, err
}

func (s *Store) MCPTokens(ctx context.Context) ([]MCPToken, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id,name,created_at,expires_at,revoked_at,`+mcpTokenProjectIDs+`
		FROM mcp_tokens ORDER BY created_at DESC,id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tokens := []MCPToken{}
	for rows.Next() {
		var token MCPToken
		if err := rows.Scan(&token.ID, &token.Name, &token.CreatedAt, &token.ExpiresAt, &token.RevokedAt, &token.ProjectIDs); err != nil {
			return nil, err
		}
		tokens = append(tokens, token)
	}
	return tokens, rows.Err()
}

func (s *Store) MCPProjects(ctx context.Context) ([]MCPProject, error) {
	rows, err := s.Pool.Query(ctx, `SELECT p.id,p.name,t.name FROM resources p
		JOIN resources t ON t.id=p.team_id AND t.kind='team'
		WHERE p.kind='project' AND p.data->'deleting' IS DISTINCT FROM 'true'::jsonb ORDER BY t.name,p.name,p.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	projects := []MCPProject{}
	for rows.Next() {
		var project MCPProject
		if err := rows.Scan(&project.ID, &project.Name, &project.TeamName); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func (s *Store) RevokeMCPToken(ctx context.Context, admin, id string) error {
	_, err := s.Pool.Exec(ctx, `WITH revoked AS (
		UPDATE mcp_tokens SET revoked_at=now() WHERE id=$2 AND revoked_at IS NULL RETURNING id
	) INSERT INTO audit(user_id,action,resource_id) SELECT $1,'mcp.token_revoked',id FROM revoked`, admin, id)
	return err
}

func (s *Store) DeleteMCPToken(ctx context.Context, admin, id string) error {
	deleted, err := s.Pool.Exec(ctx, `WITH deleted AS (
		DELETE FROM mcp_tokens WHERE id=$2 RETURNING id
	) INSERT INTO audit(user_id,action,resource_id) SELECT $1,'mcp.token_deleted',id FROM deleted`, admin, id)
	if err != nil {
		return err
	}
	if deleted.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
