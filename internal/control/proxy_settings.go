package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
	"shipyard/internal/proxy"
)

var ErrProxyConflict = errors.New("HAProxy settings changed; refresh and try again")
var ErrInvalidProxyBindings = errors.New("invalid HAProxy bindings")

func ProxySettingsKey(server string) string { return "haproxy:" + server }

type ProxySettings struct {
	Version   int            `json:"version"`
	Bindings  proxy.Bindings `json:"bindings"`
	LastJobID string         `json:"lastJobId"`
	AppliedAt *time.Time     `json:"appliedAt"`
}

type ProxyFrontend struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Protocol         string   `json:"protocol"`
	ApplicationID    string   `json:"applicationId"`
	ApplicationName  string   `json:"applicationName"`
	Ports            []int    `json:"ports"`
	Addresses        []string `json:"addresses"`
	DefaultAddresses []string `json:"defaultAddresses"`
	UseDefaults      bool     `json:"useDefaults"`
}

type ProxyApplyStatus struct {
	ID    string `json:"id"`
	State string `json:"state"`
	Error string `json:"error"`
}

type ProxyState struct {
	ProxySettings
	Image     string            `json:"image"`
	Frontends []ProxyFrontend   `json:"frontends"`
	Apply     *ProxyApplyStatus `json:"apply"`
}

type ProxySettingsInput struct {
	Version  int            `json:"version"`
	Bindings proxy.Bindings `json:"bindings"`
}

type proxySettingsJob struct {
	ProxySettingsInput
	Actor string `json:"actor"`
}

func (c *Controller) proxySettings(ctx context.Context, server string) (ProxySettings, error) {
	state := ProxySettings{Bindings: proxy.Bindings{}}
	var raw []byte
	err := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", ProxySettingsKey(server)).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return state, nil
	}
	if err != nil {
		return state, err
	}
	err = json.Unmarshal(raw, &state)
	if state.Bindings == nil {
		state.Bindings = proxy.Bindings{}
	}
	return state, err
}

func (c *Controller) storeProxySettings(ctx context.Context, server string, state ProxySettings) error {
	raw, err := json.Marshal(state)
	if err != nil {
		return err
	}
	result, err := c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM resources WHERE id=$3 AND kind='server') ON CONFLICT(key) DO UPDATE SET value=excluded.value", ProxySettingsKey(server), raw, server)
	if err == nil && result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return err
}

func (c *Controller) proxyFrontends(ctx context.Context, server string, bindings proxy.Bindings) ([]ProxyFrontend, error) {
	host, err := c.Store.Resource(ctx, server)
	if err != nil {
		return nil, err
	}
	if host.Kind != "server" {
		return nil, fmt.Errorf("%w: server required", ErrInvalidProxyBindings)
	}
	spec, err := model.Decode[model.Server](host)
	if err != nil {
		return nil, err
	}
	frontends := []ProxyFrontend{{ID: "web", Name: "Web", Protocol: "HTTP / HTTPS / gRPC", Ports: []int{80, 443}}}
	resources, err := c.Store.Resources(ctx, "")
	if err != nil {
		return nil, err
	}
	apps := map[string]model.Resource{}
	for _, r := range resources {
		if r.Kind != "application" || model.IsDeleting(r) {
			continue
		}
		app, err := model.Decode[model.App](r)
		if err != nil {
			return nil, err
		}
		if app.ServerID == server && !app.PreviewClosed {
			apps[r.ID] = r
		}
	}
	for _, r := range resources {
		app, ok := apps[r.ParentID]
		if r.Kind != "route" || !ok {
			continue
		}
		route, err := model.Decode[model.Route](r)
		if err != nil {
			return nil, err
		}
		if route.Protocol == "tcp" {
			frontends = append(frontends, ProxyFrontend{ID: r.ID, Name: r.Name, Protocol: "TCP", ApplicationID: app.ID, ApplicationName: app.Name, Ports: []int{route.ListenPort}})
		}
	}
	for i := range frontends {
		frontends[i].DefaultAddresses = proxy.DefaultAddresses(spec.IPv6 != "")
		addresses, exists := bindings[frontends[i].ID]
		if !exists {
			addresses = proxy.DefaultAddresses(spec.IPv6 != "")
		}
		frontends[i].Addresses = addresses
		frontends[i].UseDefaults = !exists
	}
	return frontends, nil
}

func (c *Controller) validateProxyBindings(ctx context.Context, server string, input proxy.Bindings) (proxy.Bindings, error) {
	bindings, err := proxy.NormalizeBindings(input)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidProxyBindings, err)
	}
	frontends, err := c.proxyFrontends(ctx, server, bindings)
	if err != nil {
		return nil, err
	}
	allowed := map[string]bool{}
	for _, f := range frontends {
		allowed[f.ID] = true
	}
	for id := range bindings {
		if !allowed[id] {
			return nil, fmt.Errorf("%w: frontend %s does not belong to this server", ErrInvalidProxyBindings, id)
		}
	}
	return bindings, nil
}

func (c *Controller) ProxyState(ctx context.Context, server string) (ProxyState, error) {
	settings, err := c.proxySettings(ctx, server)
	if err != nil {
		return ProxyState{}, err
	}
	state := ProxyState{ProxySettings: settings, Image: proxy.Image}
	state.Frontends, err = c.proxyFrontends(ctx, server, settings.Bindings)
	if err != nil {
		return state, err
	}
	var status ProxyApplyStatus
	err = c.Store.Pool.QueryRow(ctx, "SELECT id,state,last_error FROM jobs WHERE kind='proxy-settings' AND resource_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", server).Scan(&status.ID, &status.State, &status.Error)
	if err == nil {
		state.Apply = &status
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return state, err
	}
	return state, nil
}

func (c *Controller) QueueProxySettings(ctx context.Context, server, actor string, input ProxySettingsInput) (string, error) {
	unlock, err := c.lock(ctx, "proxy:"+server)
	if err != nil {
		return "", err
	}
	defer unlock()
	if err = c.mutableResource(ctx, server); err != nil {
		return "", err
	}
	state, err := c.proxySettings(ctx, server)
	if err != nil {
		return "", err
	}
	if input.Version != state.Version {
		return "", ErrProxyConflict
	}
	bindings, err := c.validateProxyBindings(ctx, server, input.Bindings)
	if err != nil {
		return "", err
	}
	var pending bool
	if err = c.Store.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM jobs WHERE kind='proxy-settings' AND resource_id=$1 AND state IN ('queued','running'))", server).Scan(&pending); err != nil {
		return "", err
	}
	if pending {
		return "", fmt.Errorf("%w: another apply is in progress", ErrProxyConflict)
	}
	id := uuid.NewString()
	payload := proxySettingsJob{ProxySettingsInput: ProxySettingsInput{Version: input.Version, Bindings: bindings}, Actor: actor}
	raw, _ := json.Marshal(payload)
	_, err = c.Store.Pool.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'proxy-settings',$2,$3,$1)", id, server, raw)
	return id, err
}

func (c *Controller) applyProxySettings(ctx context.Context, job model.Job) error {
	return c.applyProxySettingsWith(ctx, job, func(applyCtx context.Context, bindings proxy.Bindings) error {
		return c.syncProxyLocked(applyCtx, job.ResourceID, nil, bindings)
	})
}

func (c *Controller) applyProxySettingsWith(ctx context.Context, job model.Job, apply func(context.Context, proxy.Bindings) error) (result error) {
	unlock, err := c.lock(ctx, "proxy:"+job.ResourceID)
	if err != nil {
		return err
	}
	defer unlock()
	if err = c.mutableResource(ctx, job.ResourceID); err != nil {
		return err
	}
	var input proxySettingsJob
	if err = json.Unmarshal(job.Payload, &input); err != nil {
		return err
	}
	defer func() {
		action := "haproxy.settings_applied"
		if result != nil {
			action = "haproxy.settings_failed"
		}
		_ = c.Store.Audit(context.WithoutCancel(ctx), input.Actor, action, job.ResourceID, "", map[string]any{"jobId": job.ID, "version": input.Version})
	}()
	state, err := c.proxySettings(ctx, job.ResourceID)
	if err != nil {
		return err
	}
	if state.LastJobID == job.ID {
		return nil
	}
	if input.Version != state.Version {
		return ErrProxyConflict
	}
	bindings, err := c.validateProxyBindings(ctx, job.ResourceID, input.Bindings)
	if err != nil {
		return err
	}
	if err = apply(ctx, bindings); err != nil {
		return err
	}
	now := time.Now().UTC()
	next := ProxySettings{Version: state.Version + 1, Bindings: bindings, AppliedAt: &now, LastJobID: job.ID}
	if err = c.storeProxySettings(ctx, job.ResourceID, next); err != nil {
		// The remote generation changed, but its settings were not committed.
		// Restore the committed settings before allowing another proxy update.
		recoverCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if recoveryErr := apply(recoverCtx, state.Bindings); recoveryErr != nil {
			return fmt.Errorf("persist HAProxy settings: %w; previous settings recovery failed: %v", err, recoveryErr)
		}
		return err
	}
	return nil
}

func (c *Controller) PruneProxySettings(ctx context.Context, server string) error {
	unlock, err := c.lock(ctx, "proxy:"+server)
	if err != nil {
		return err
	}
	defer unlock()
	state, err := c.proxySettings(ctx, server)
	if err != nil {
		return err
	}
	frontends, err := c.proxyFrontends(ctx, server, state.Bindings)
	if err != nil {
		return err
	}
	allowed := map[string]bool{}
	for _, f := range frontends {
		allowed[f.ID] = true
	}
	changed := false
	for id := range state.Bindings {
		if !allowed[id] {
			delete(state.Bindings, id)
			changed = true
		}
	}
	if !changed {
		return nil
	}
	state.Version++
	return c.storeProxySettings(ctx, server, state)
}
