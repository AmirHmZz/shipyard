package control

import (
	"context"
	"github.com/google/uuid"
	"shipyard/internal/db"
	"shipyard/internal/model"
)

// Registration and revocation share a mutex so no terminal can escape the
// deletion freeze between the API's initial authorization and Docker exec.
func (c *Controller) RegisterTerminal(ctx context.Context, app string, close func()) (func(), error) {
	c.terminalMu.Lock()
	defer c.terminalMu.Unlock()
	r, e := c.Store.Resource(ctx, app)
	if e != nil {
		return nil, e
	}
	if model.IsDeleting(r) {
		return nil, db.ErrDeleting
	}
	if c.terminals == nil {
		c.terminals = map[string]map[string]func(){}
	}
	if c.terminals[app] == nil {
		c.terminals[app] = map[string]func(){}
	}
	id := uuid.NewString()
	c.terminals[app][id] = close
	return func() {
		c.terminalMu.Lock()
		defer c.terminalMu.Unlock()
		delete(c.terminals[app], id)
		if len(c.terminals[app]) == 0 {
			delete(c.terminals, app)
		}
	}, nil
}
func (c *Controller) CloseApplicationTerminals(app string) {
	c.terminalMu.Lock()
	sessions := c.terminals[app]
	delete(c.terminals, app)
	c.terminalMu.Unlock()
	for _, close := range sessions {
		close()
	}
}
