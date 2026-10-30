package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
)

// lockPresentation shares the deletion/configuration lock but never changes a
// resource version: presentation updates cannot invalidate deployment drafts.
func lockPresentation(ctx context.Context, tx pgx.Tx, id string) (model.Resource, error) {
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return model.Resource{}, err
	}
	r, err := scanResource(tx.QueryRow(ctx, "SELECT "+resourceColumns+" FROM resources WHERE id=$1", id))
	if err != nil {
		return r, err
	}
	if r.Kind != "project" && r.Kind != "application" {
		return r, fmt.Errorf("%w: only projects and applications support presentation settings", ErrConflict)
	}
	var deleting bool
	err = tx.QueryRow(ctx, `WITH RECURSIVE lineage AS (
		SELECT id,parent_id,data FROM resources WHERE id=$1
		UNION SELECT p.id,p.parent_id,p.data FROM resources p JOIN lineage c ON c.parent_id=p.id
	) SELECT EXISTS(SELECT 1 FROM lineage WHERE data->>'deleting'='true')`, id).Scan(&deleting)
	if err == nil && deleting {
		err = ErrDeleting
	}
	return r, err
}

func (s *Store) SaveLogo(ctx context.Context, id, revision string, image []byte) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = lockPresentation(ctx, tx, id); err != nil {
		return err
	}
	if image == nil {
		_, err = tx.Exec(ctx, "DELETE FROM resource_logos WHERE resource_id=$1", id)
	} else {
		_, err = tx.Exec(ctx, `INSERT INTO resource_logos(resource_id,revision,image) VALUES($1,$2,$3)
		ON CONFLICT(resource_id) DO UPDATE SET revision=excluded.revision,image=excluded.image`, id, revision, image)
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) MoveResource(ctx context.Context, id string, before *string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	r, err := lockPresentation(ctx, tx, id)
	if err != nil {
		return err
	}
	var app model.App
	if r.Kind == "application" {
		app, err = model.Decode[model.App](r)
		if err != nil {
			return err
		}
		if app.PreviewOf != "" {
			return fmt.Errorf("%w: preview cards cannot be reordered", ErrConflict)
		}
	}
	if before != nil {
		anchor, err := lockPresentation(ctx, tx, *before)
		if err != nil {
			return err
		}
		var target model.App
		if anchor.Kind == "application" {
			target, _ = model.Decode[model.App](anchor)
		}
		if anchor.Kind != r.Kind || r.Kind == "application" && (anchor.ParentID != r.ParentID || target.PreviewOf != "") {
			return fmt.Errorf("%w: cards must belong to the same ordering scope", ErrConflict)
		}
		if *before == id {
			return tx.Commit(ctx)
		}
	}
	rows, err := tx.Query(ctx, `SELECT id FROM resources WHERE kind=$1 AND ($1='project' OR (parent_id=$2 AND COALESCE(data->>'previewOf','')='')) ORDER BY sort_order,created_at,id`, r.Kind, r.ParentID)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var next string
		if err = rows.Scan(&next); err != nil {
			rows.Close()
			return err
		}
		if next != id {
			ids = append(ids, next)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	ordered := make([]string, 0, len(ids)+1)
	for _, next := range ids {
		if before != nil && next == *before {
			ordered = append(ordered, id)
		}
		ordered = append(ordered, next)
	}
	if before == nil {
		ordered = append(ordered, id)
	}
	// Fresh sequence values keep future inserts at the end, including after a
	// move in another scope. Other fields and invisible siblings stay intact.
	for _, next := range ordered {
		if _, err = tx.Exec(ctx, "UPDATE resources SET sort_order=nextval('resource_card_order') WHERE id=$1", next); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
