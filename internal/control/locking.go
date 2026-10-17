package control

import (
	"context"
	"time"
)

func (c *Controller) lock(ctx context.Context, key string) (func(), error) {
	conn, err := c.Store.Pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	if _, err = conn.Exec(ctx, "SELECT pg_advisory_lock(hashtextextended($1,0))", key); err != nil {
		conn.Release()
		return nil, err
	}
	return func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		_, _ = conn.Exec(cleanup, "SELECT pg_advisory_unlock(hashtextextended($1,0))", key)
		conn.Release()
	}, nil
}

// Metrics must skip busy applications instead of waiting while holding the server lock.
func (c *Controller) tryLock(ctx context.Context, key string) (func(), bool, error) {
	conn, err := c.Store.Pool.Acquire(ctx)
	if err != nil {
		return nil, false, err
	}
	var acquired bool
	if err = conn.QueryRow(ctx, "SELECT pg_try_advisory_lock(hashtextextended($1,0))", key).Scan(&acquired); err != nil || !acquired {
		conn.Release()
		return nil, false, err
	}
	return func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		_, _ = conn.Exec(cleanup, "SELECT pg_advisory_unlock(hashtextextended($1,0))", key)
		conn.Release()
	}, true, nil
}
