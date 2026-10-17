package control

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"shipyard/internal/model"
	"strings"
)

func (c *Controller) DisablePreviews(ctx context.Context, app string) error {
	unlock, e := c.lock(ctx, "application-previews:"+app)
	if e != nil {
		return e
	}
	defer unlock()
	tx, e := c.Store.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); e != nil {
		return e
	}
	rows, e := tx.Query(ctx, "UPDATE resources SET data=jsonb_set(data,'{previewClosed}','true'),version=version+1 WHERE kind='application' AND data->>'previewOf'=$1 RETURNING id", app)
	if e != nil {
		return e
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, id)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, id := range ids {
		if _, e = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,dedupe) VALUES($1,'preview-cleanup',$2,$3)", uuid.NewString(), id, "disable-preview:"+uuid.NewString()); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}
func (c *Controller) ValidatePreviewDomain(ctx context.Context, id, team string, a model.App) error {
	if a.PreviewDomain == "" {
		return nil
	}
	d, e := model.Domain(a.PreviewDomain)
	if e != nil {
		return e
	}
	a.PreviewDomain = d
	zone, e := c.Store.Resource(ctx, a.PreviewZoneID)
	if e != nil {
		return e
	}
	z, e := model.Decode[model.Zone](zone)
	if e != nil {
		return e
	}
	if !domainWithin(d, z.Domain) {
		return fmt.Errorf("preview wildcard does not belong to the selected zone")
	}
	var used bool
	e = c.Store.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE kind='application' AND id<>$1 AND COALESCE(data->>'previewOf','')='' AND data->>'previewDomain'=$2)", id, d).Scan(&used)
	if e != nil {
		return e
	}
	if used {
		return fmt.Errorf("preview wildcard is already assigned to another application")
	}
	return nil
}
func domainWithin(domain, zone string) bool {
	return domain == zone || strings.HasSuffix(domain, "."+zone)
}
