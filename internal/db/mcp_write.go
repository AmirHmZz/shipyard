package db

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
)

type mcpWriteContextKey struct{}

type MCPWriteAccess struct {
	Hash, TargetID, Kind, Permission              string
	RequireAdmin, AllowMaintenance, AllowDeleting bool
	CreateID, DeploymentID, ConfirmName           string
}

func WithMCPWrite(ctx context.Context, access MCPWriteAccess) context.Context {
	return context.WithValue(ctx, mcpWriteContextKey{}, access)
}

func MCPWrite(ctx context.Context) MCPWriteAccess {
	access, _ := ctx.Value(mcpWriteContextKey{}).(MCPWriteAccess)
	return access
}

type mcpQueryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

// The target is fixed by the tool before dispatch. The query follows current
// ancestry and intersects the token grant with the owner's current role.
func MCPWritePrincipal(ctx context.Context, q mcpQueryer, access MCPWriteAccess) (model.User, error) {
	var owner model.User
	var maintenance bool
	err := q.QueryRow(ctx, `SELECT u.id,u.admin,
		COALESCE((SELECT value::text='true' FROM settings WHERE key='maintenance'),false)
		FROM mcp_tokens token
		JOIN users u ON u.id=token.owner_id
		JOIN mcp_token_projects scope ON scope.token_id=token.id
		JOIN resources p ON p.id=scope.project_id
		JOIN resources env ON env.parent_id=p.id AND env.team_id=p.team_id AND env.kind='environment'
		JOIN resources target ON target.id=$2 AND target.kind=$3 AND target.team_id=p.team_id
		WHERE token.token_hash=$1 AND token.revoked_at IS NULL AND token.expires_at>clock_timestamp()
		AND $4=ANY(scope.permissions) AND (NOT $5 OR u.admin)
		AND ($6 OR target.data->>'deleting' IS DISTINCT FROM 'true')
		AND ($7='' OR target.name=$7)
		AND env.data->>'deleting' IS DISTINCT FROM 'true'
		AND (CASE target.kind
			WHEN 'environment' THEN target.id=env.id
			WHEN 'application' THEN target.parent_id=env.id
			WHEN 'route' THEN EXISTS(SELECT 1 FROM resources app
				WHERE app.id=target.parent_id AND app.kind='application' AND app.parent_id=env.id AND app.team_id=p.team_id
				AND app.data->>'deleting' IS DISTINCT FROM 'true')
			ELSE false END)
		AND `+mcpReadableProject+` AND `+mcpWritableProject+`
		FOR SHARE OF u,token,scope`,
		access.Hash, access.TargetID, access.Kind, access.Permission, access.RequireAdmin, access.AllowDeleting, access.ConfirmName).
		Scan(&owner.ID, &owner.Admin, &maintenance)
	if err == nil && maintenance && !access.AllowMaintenance {
		err = ErrMCPMaintenance
	}
	return owner, err
}

var ErrMCPMaintenance = errors.New("Shipyard is in maintenance mode")

// CheckMCPWrite is a no-op for dashboard and background work. Mutation paths
// call it after their normal locks and before admitting a token's write.
func CheckMCPWrite(ctx context.Context, q mcpQueryer) error {
	access := MCPWrite(ctx)
	if access.Hash == "" {
		return nil
	}
	_, err := MCPWritePrincipal(ctx, q, access)
	return err
}

func (s *Store) QueueDomainSync(ctx context.Context, id string, payload any) error {
	if MCPWrite(ctx).Hash == "" {
		return s.Enqueue(ctx, "domain", id, uuid.NewString(), payload)
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = CheckMCPWrite(ctx, tx); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'domain',$2,$3,$4)",
		uuid.NewString(), id, raw, "domain:"+uuid.NewString()); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) DeleteResourceRecord(ctx context.Context, id string) error {
	const statement = "DELETE FROM resources WHERE id=$1"
	if MCPWrite(ctx).Hash == "" {
		_, err := s.Pool.Exec(ctx, statement, id)
		return err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	if err = CheckMCPWrite(ctx, tx); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, statement, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
