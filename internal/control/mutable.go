package control

import (
	"context"
	"shipyard/internal/db"
	"shipyard/internal/model"
)

// Recheck after waiting for an operational lock: deletion may have frozen a
// resource after its worker or HTTP request initially authorized the mutation.
func (c *Controller) mutableResource(ctx context.Context, id string) error {
	r, e := c.Store.Resource(ctx, id)
	if e != nil {
		return e
	}
	if model.IsDeleting(r) {
		return db.ErrDeleting
	}
	return nil
}
