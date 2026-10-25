package control

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
)

const controlNetworkPrefix = "control-plane-network:"

type controlNetworkSelection struct {
	Desired bool   `json:"desired"`
	Error   string `json:"error"`
}

type ControlPlaneNetwork struct {
	NetworkID string `json:"networkId"`
	Desired   bool   `json:"desired"`
	Attached  bool   `json:"attached"`
	Error     string `json:"error"`
}

type ControlPlaneNetworks struct {
	Available bool                  `json:"available"`
	Networks  []ControlPlaneNetwork `json:"networks"`
}

type controlContainer struct {
	ID              string `json:"Id"`
	Config          struct{ Labels map[string]string }
	State           struct{ Running bool }
	HostConfig      struct{ NetworkMode string }
	NetworkSettings struct {
		Networks map[string]struct{ NetworkID string }
	}
}

func (c *Controller) controlContainer(ctx context.Context) (controlContainer, error) {
	var self controlContainer
	if c.Local == nil || c.SelfContainer == "" {
		return self, errors.New("control-plane network attachments require a native Local host installation")
	}
	if _, _, err := c.connect(ctx, LocalServerID); err != nil {
		return self, err
	}
	err := c.Local.API(ctx, "GET", "/containers/"+url.PathEscape(c.SelfContainer)+"/json", nil, &self)
	if err == nil && (self.ID == "" || !self.State.Running || self.Config.Labels["shipyard.role"] != "control-plane") {
		err = errors.New("running control-plane container identity could not be verified")
	}
	return self, err
}

func (c *Controller) controlNetworkSelections(ctx context.Context) (map[string]controlNetworkSelection, error) {
	rows, err := c.Store.Pool.Query(ctx, "SELECT key,value FROM settings WHERE starts_with(key,$1)", controlNetworkPrefix)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := map[string]controlNetworkSelection{}
	for rows.Next() {
		var key string
		var raw []byte
		if err = rows.Scan(&key, &raw); err != nil {
			return nil, err
		}
		var selection controlNetworkSelection
		if err = json.Unmarshal(raw, &selection); err != nil {
			return nil, err
		}
		items[strings.TrimPrefix(key, controlNetworkPrefix)] = selection
	}
	return items, rows.Err()
}

func controlNetworkEligible(r model.Resource, n model.Network) bool {
	return r.Kind == "network" && !Protected(r.ID) && n.ServerID == LocalServerID && n.IngressApp == ""
}

func controlNetworkAttached(self controlContainer, dockerID string) bool {
	for _, endpoint := range self.NetworkSettings.Networks {
		if dockerID != "" && endpoint.NetworkID == dockerID {
			return true
		}
	}
	return false
}

func (c *Controller) ControlPlaneNetworkStatus(ctx context.Context) (ControlPlaneNetworks, error) {
	result := ControlPlaneNetworks{Available: c.Local != nil, Networks: []ControlPlaneNetwork{}}
	if !result.Available {
		return result, nil
	}
	self, err := c.controlContainer(ctx)
	if err != nil {
		return result, err
	}
	selections, err := c.controlNetworkSelections(ctx)
	if err != nil {
		return result, err
	}
	resources, err := c.Store.Resources(ctx, "network")
	if err != nil {
		return result, err
	}
	for _, r := range resources {
		n, err := model.Decode[model.Network](r)
		if err != nil {
			return result, err
		}
		if controlNetworkEligible(r, n) && n.DockerName != self.HostConfig.NetworkMode {
			s := selections[r.ID]
			result.Networks = append(result.Networks, ControlPlaneNetwork{r.ID, s.Desired, controlNetworkAttached(self, n.DockerID), s.Error})
		}
	}
	return result, nil
}

func (c *Controller) writeControlNetwork(ctx context.Context, id string, selection controlNetworkSelection) error {
	raw, err := json.Marshal(selection)
	if err != nil {
		return err
	}
	_, err = c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", controlNetworkPrefix+id, raw)
	return err
}

// Only shared bridges can be changed. Compose's installation network and the
// protected dashboard ingress must never be detached by this feature.
func (c *Controller) inspectControlNetwork(ctx context.Context, r model.Resource, n model.Network, self controlContainer) (DockerNetwork, error) {
	var actual DockerNetwork
	if !controlNetworkEligible(r, n) || n.DockerID == "" {
		return actual, errors.New("select a ready shared network on Local host")
	}
	if err := c.Local.API(ctx, "GET", "/networks/"+url.PathEscape(n.DockerID), nil, &actual); err != nil {
		return actual, err
	}
	if actual.ID != n.DockerID || actual.Driver != "bridge" || actual.Name == "bridge" || actual.Name == self.HostConfig.NetworkMode || actual.Labels["com.docker.compose.project"] == "shipyard" {
		return actual, errors.New("installation networks and non-bridge networks cannot be changed")
	}
	if n.Managed && actual.Labels["shipyard.network"] != r.ID {
		return actual, errors.New("managed network ownership could not be verified")
	}
	return actual, nil
}

func (c *Controller) SetControlPlaneNetwork(ctx context.Context, id string, desired bool) (ControlPlaneNetwork, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	unlock, err := c.lock(ctx, "networks:"+LocalServerID)
	if err != nil {
		return ControlPlaneNetwork{}, err
	}
	defer unlock()
	r, err := c.Store.Resource(ctx, id)
	if err != nil {
		return ControlPlaneNetwork{}, err
	}
	n, err := model.Decode[model.Network](r)
	if err != nil {
		return ControlPlaneNetwork{}, err
	}
	if err = c.mutableResource(ctx, id); err != nil {
		return ControlPlaneNetwork{}, err
	}
	if !controlNetworkEligible(r, n) || n.DockerID == "" {
		return ControlPlaneNetwork{}, errors.New("select a ready shared network on Local host")
	}
	self, err := c.controlContainer(ctx)
	if err != nil {
		return ControlPlaneNetwork{}, err
	}
	if desired {
		if _, err = c.inspectControlNetwork(ctx, r, n, self); err != nil {
			return ControlPlaneNetwork{}, err
		}
	}
	if desired && n.Status != "ready" {
		return ControlPlaneNetwork{}, errors.New("network must be ready before attaching Shipyard")
	}
	selection := controlNetworkSelection{Desired: desired}
	if err = c.writeControlNetwork(ctx, id, selection); err != nil {
		return ControlPlaneNetwork{}, err
	}
	return c.applyControlNetwork(ctx, r, n, selection, self)
}

func (c *Controller) applyControlNetwork(ctx context.Context, r model.Resource, n model.Network, selection controlNetworkSelection, self controlContainer) (ControlPlaneNetwork, error) {
	status := ControlPlaneNetwork{NetworkID: r.ID, Desired: selection.Desired, Attached: controlNetworkAttached(self, n.DockerID)}
	var err error
	if status.Desired || status.Attached {
		_, err = c.inspectControlNetwork(ctx, r, n, self)
	}
	if err == nil && status.Attached != status.Desired {
		action := "disconnect"
		if status.Desired {
			action = "connect"
		}
		body := map[string]any{"Container": self.ID}
		if status.Desired {
			// Prefer the existing installation gateway on Engines supporting
			// endpoint priorities (older Engines ignore this optional field).
			body["EndpointConfig"] = map[string]any{"GwPriority": -1}
		}
		err = c.Local.API(ctx, "POST", "/networks/"+url.PathEscape(n.DockerID)+"/"+action, body, nil)
	}
	if err == nil {
		var verified controlContainer
		err = c.Local.API(ctx, "GET", "/containers/"+url.PathEscape(self.ID)+"/json", nil, &verified)
		if err == nil {
			status.Attached = controlNetworkAttached(verified, n.DockerID)
			if status.Attached != status.Desired {
				err = errors.New("control-plane network attachment could not be verified")
			}
		}
	}
	previousError := selection.Error
	selection.Error = ""
	if err != nil {
		selection.Error = err.Error()
	}
	status.Error = selection.Error
	if previousError == selection.Error {
		return status, nil
	}
	// Keep the desired state even when the Docker call fails or the request is
	// cancelled. Startup/periodic reconciliation will retry that same intent.
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	return status, c.writeControlNetwork(cleanup, r.ID, selection)
}

func (c *Controller) ReconcileControlPlaneNetworks(ctx context.Context) error {
	if c.Local == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	unlock, err := c.lock(ctx, "networks:"+LocalServerID)
	if err != nil {
		return err
	}
	defer unlock()
	selections, err := c.controlNetworkSelections(ctx)
	if err != nil || len(selections) == 0 {
		return err
	}
	self, err := c.controlContainer(ctx)
	if err != nil {
		return err
	}
	for id, selection := range selections {
		r, err := c.Store.Resource(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		n, err := model.Decode[model.Network](r)
		if err != nil {
			return err
		}
		if _, err = c.applyControlNetwork(ctx, r, n, selection, self); err != nil {
			return err
		}
	}
	return nil
}

func (c *Controller) controlNetworkLoop(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if c.Store.Maintenance(ctx) {
				continue
			}
			attempt, cancel := context.WithTimeout(ctx, 30*time.Second)
			if err := c.ReconcileControlPlaneNetworks(attempt); err != nil {
				c.Logger.Error("reconcile control-plane networks", "error", err)
			}
			cancel()
		}
	}
}
