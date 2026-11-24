package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"shipyard/internal/db/query"
	"shipyard/internal/model"
)

func checkGitBinding(ctx context.Context, tx pgx.Tx, team, id string, old model.Resource) error {
	allowed, err := query.New(tx).ResourceGranted(ctx, query.ResourceGrantedParams{ResourceID: id, TeamID: team})
	if err != nil {
		return err
	}
	if !allowed {
		return fmt.Errorf("%w: Git connection is unavailable to this team", ErrConflict)
	}
	var teamID, status string
	if err := tx.QueryRow(ctx, `SELECT team_id,COALESCE(data->>'status','') FROM resources WHERE id=$1 AND kind='git'`, id).Scan(&teamID, &status); err != nil {
		return err
	}
	previous, _ := model.Decode[model.App](old)
	if teamID != "" && status != "ready" && (previous.Source == "compose" || previous.GitID != id) {
		return fmt.Errorf("%w: finish authorizing the Git connection before using it", ErrConflict)
	}
	return nil
}

// DeleteGitConnection serializes deletion with application saves and locks the
// connection before removing its webhook delivery records.
func (s *Store) DeleteGitConnection(ctx context.Context, id string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx, "SELECT id FROM resources WHERE id=$1 AND kind='git' FOR UPDATE", id).Scan(&id); err != nil {
		return err
	}
	var referenced bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM resources WHERE kind='application' AND data->>'gitId'=$1)`, id).Scan(&referenced); err != nil {
		return err
	}
	if referenced {
		return fmt.Errorf("%w: Git connection is still referenced by an application", ErrConflict)
	}
	if _, err := tx.Exec(ctx, "DELETE FROM webhook_deliveries WHERE provider_id=$1", id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM resources WHERE id=$1", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) DeleteTeam(ctx context.Context, id string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	var children bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE parent_id=$1)", id).Scan(&children); err != nil {
		return err
	}
	if children {
		return fmt.Errorf("%w: remove child resources first", ErrConflict)
	}
	if _, err := tx.Exec(ctx, "DELETE FROM resources WHERE kind='team' AND id=$1", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
