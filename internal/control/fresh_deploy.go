package control

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

type freshDeployment struct {
	Application string              `json:"application"`
	Daemon      string              `json:"daemon"`
	Containers  []deletionContainer `json:"containers"`
	Volumes     []deletionVolume    `json:"volumes"`
	Completed   map[string]bool     `json:"completed"`
	Removing    map[string]bool     `json:"removing,omitempty"`
	Started     bool                `json:"started"`
	ResetDone   bool                `json:"resetDone"`
}

func freshDeploymentKey(id string) string { return "fresh-deployment:" + id }

func (c *Controller) saveFreshDeployment(ctx context.Context, id string, m *freshDeployment) error {
	raw, err := json.Marshal(m)
	if err != nil {
		return err
	}
	// Container commands and volume-driver options can contain credentials.
	// Only coordination metadata stays outside the vault-encrypted manifest.
	encrypted, err := c.Store.Vault.Seal(raw, freshDeploymentKey(id))
	if err != nil {
		return err
	}
	raw, err = json.Marshal(struct {
		Application string `json:"application"`
		Started     bool   `json:"started"`
		Payload     []byte `json:"payload"`
	}{m.Application, m.Started, encrypted})
	if err != nil {
		return err
	}
	_, err = c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", freshDeploymentKey(id), raw)
	return err
}

func (c *Controller) loadFreshDeployment(ctx context.Context, id string) (*freshDeployment, error) {
	var raw []byte
	if err := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", freshDeploymentKey(id)).Scan(&raw); err != nil {
		return nil, err
	}
	var envelope struct {
		Payload []byte `json:"payload"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, err
	}
	plain, err := c.Store.Vault.Open(envelope.Payload, freshDeploymentKey(id))
	if err != nil {
		return nil, err
	}
	var manifest freshDeployment
	if err = json.Unmarshal(plain, &manifest); err != nil {
		return nil, err
	}
	return &manifest, nil
}

// Rendered Compose names are authoritative for external volumes, including a
// volume which a surviving application references but has not mounted yet.
func composeVolumeNames(r model.Release) (external, named map[string]bool, anonymous map[string]map[string]bool, err error) {
	var cfg struct {
		Volumes map[string]struct {
			Name     string
			External bool
		}
		Services map[string]struct {
			Volumes []struct{ Type, Source, Target string }
		}
	}
	if err = json.Unmarshal([]byte(r.Compose), &cfg); err != nil {
		return
	}
	external, named, anonymous = map[string]bool{}, map[string]bool{}, map[string]map[string]bool{}
	for key, v := range cfg.Volumes {
		name := v.Name
		if name == "" {
			if v.External {
				name = key
			} else {
				name = deploy.Project(r) + "_" + key
			}
		}
		named[name] = true
		if v.External {
			external[name] = true
		}
	}
	for key, service := range cfg.Services {
		anonymous[key] = map[string]bool{}
		for _, v := range service.Volumes {
			if v.Type == "volume" && v.Source == "" {
				anonymous[key][v.Target] = true
			}
		}
	}
	return
}

func (c *Controller) inventoryFreshDeployment(ctx context.Context, node remote.Node, r model.Release) (*freshDeployment, error) {
	daemon, err := deploy.Output(ctx, node, "docker", "info", "--format", "{{.ID}}")
	if err != nil {
		return nil, err
	}
	if daemon == "" {
		return nil, errors.New("Docker host identity unavailable")
	}
	m := &freshDeployment{Application: r.AppID, Daemon: daemon, Completed: map[string]bool{}}
	host, err := c.Store.Resource(ctx, r.ServerID)
	if err != nil {
		return nil, err
	}
	spec, err := model.Decode[model.Server](host)
	if err != nil {
		return nil, err
	}
	if spec.DaemonID != "" && spec.DaemonID != daemon {
		return nil, errors.New("Docker host identity changed")
	}
	projects := map[string]bool{"sy-" + r.AppID: true}
	releases := map[string]model.Release{r.ID: r}
	external, namedOther := map[string]bool{}, map[string]bool{}
	rows, err := c.Store.Pool.Query(ctx, "SELECT id FROM releases")
	if err != nil {
		return nil, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	for _, id := range ids {
		kept, e := c.Store.Release(ctx, id)
		if e != nil {
			return nil, e
		}
		if kept.ServerID != r.ServerID {
			continue
		}
		ext, names, _, e := composeVolumeNames(kept)
		if e != nil {
			return nil, e
		}
		for name := range ext {
			external[name] = true
		}
		if kept.AppID == r.AppID {
			releases[id] = kept
			projects[deploy.Project(kept)] = true
		} else {
			for name := range names {
				namedOther[name] = true
			}
		}
	}
	// Also protect external volumes declared by the new release.
	ext, _, _, err := composeVolumeNames(r)
	if err != nil {
		return nil, err
	}
	for name := range ext {
		external[name] = true
	}
	containers, err := inspectDeletionObjects[deletionContainer](ctx, node, "container")
	if err != nil {
		return nil, err
	}
	owned, anonymousNames := map[string]bool{}, map[string]bool{}
	for _, item := range containers {
		labels := item.Config.Labels
		if labels["shipyard.app"] != r.AppID && !projects[labels["com.docker.compose.project"]] {
			continue
		}
		kept, known := releases[labels["shipyard.release"]]
		if !known || labels["shipyard.app"] != r.AppID || labels["com.docker.compose.project"] != deploy.Project(kept) || labels["shipyard.role"] != "" {
			return nil, errors.New("application container ownership is ambiguous")
		}
		m.Containers = append(m.Containers, item)
		owned[item.ID] = true
		_, names, targets, e := composeVolumeNames(kept)
		if e != nil {
			return nil, e
		}
		for _, mount := range item.Mounts {
			if mount.Type != "volume" || names[mount.Name] {
				continue
			}
			_, imageVolume := item.Config.Volumes[mount.Destination]
			_, randomName := hex.DecodeString(mount.Name)
			if len(mount.Name) == 64 && randomName == nil && (targets[labels["com.docker.compose.service"]][mount.Destination] || imageVolume) {
				anonymousNames[mount.Name] = true
			}
		}
	}
	volumes, err := inspectDeletionObjects[deletionVolume](ctx, node, "volume")
	if err != nil {
		return nil, err
	}
	for _, v := range volumes {
		if external[v.Name] || namedOther[v.Name] {
			continue
		}
		if !projects[v.Labels["com.docker.compose.project"]] && !anonymousNames[v.Name] {
			continue
		}
		shared := false
		for _, item := range containers {
			for _, mount := range item.Mounts {
				if mount.Type == "volume" && mount.Name == v.Name && !owned[item.ID] {
					shared = true
				}
			}
		}
		if shared {
			continue
		}
		m.Volumes = append(m.Volumes, v)
	}
	return m, nil
}

func (c *Controller) resetFreshDeployment(ctx context.Context, node remote.Node, r model.Release, started *bool) error {
	m, err := c.loadFreshDeployment(ctx, r.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		m, err = c.inventoryFreshDeployment(ctx, node, r)
		if err != nil {
			return err
		}
		if err = c.saveFreshDeployment(ctx, r.ID, m); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	*started = m.Started
	daemon, err := deploy.Output(ctx, node, "docker", "info", "--format", "{{.ID}}")
	if err != nil {
		return err
	}
	if daemon != m.Daemon {
		return errors.New("Docker host identity changed during Fresh deploy")
	}
	if m.ResetDone {
		return nil
	}
	// Revalidate the whole manifest before withdrawing traffic or stopping apps.
	containers, err := inspectDeletionObjects[deletionContainer](ctx, node, "container")
	if err != nil {
		return err
	}
	owned := map[string]bool{}
	for _, expected := range m.Containers {
		owned[expected.ID] = true
	}
	for _, item := range containers {
		if owned[item.ID] {
			for _, expected := range m.Containers {
				if item.ID == expected.ID && digestJSON(item) != digestJSON(expected) {
					return errors.New("application container changed during Fresh deploy")
				}
			}
		} else if item.Config.Labels["shipyard.app"] == r.AppID {
			return errors.New("application containers changed during Fresh deploy")
		}
	}
	volumes, err := inspectDeletionObjects[deletionVolume](ctx, node, "volume")
	if err != nil {
		return err
	}
	for _, expected := range m.Volumes {
		for _, v := range volumes {
			if v.Name == expected.Name && m.Removing[v.Name] && !m.Completed[v.Name] {
				return fmt.Errorf("volume removal was interrupted; confirm a new Fresh deploy before resetting %s", v.Name)
			}
			if v.Name == expected.Name && (m.Completed[v.Name] || digestJSON(v) != digestJSON(expected)) {
				return fmt.Errorf("volume was replaced during Fresh deploy: %s", v.Name)
			}
		}
		for _, item := range containers {
			for _, mount := range item.Mounts {
				if mount.Type == "volume" && mount.Name == expected.Name && !owned[item.ID] {
					return fmt.Errorf("volume gained an unrelated consumer: %s", expected.Name)
				}
			}
		}
	}
	m.Started = true
	if err = c.saveFreshDeployment(ctx, r.ID, m); err != nil {
		return err
	}
	*started = true
	if _, err = c.Store.Pool.Exec(ctx, "UPDATE app_runtime SET status='stopped',updated_at=now() WHERE app_id=$1", r.AppID); err != nil {
		return err
	}
	if err = c.syncProxy(ctx, r.ServerID, nil); err != nil {
		return err
	}
	for _, expected := range m.Containers {
		for _, item := range containers {
			if item.ID == expected.ID {
				if _, err = deploy.Output(ctx, node, "docker", "rm", "-f", item.ID); err != nil {
					return err
				}
			}
		}
	}
	for _, expected := range m.Volumes {
		if m.Completed[expected.Name] {
			continue
		}
		current, e := inspectDeletionObjects[deletionVolume](ctx, node, "volume")
		if e != nil {
			return e
		}
		for _, v := range current {
			if v.Name != expected.Name {
				continue
			}
			if digestJSON(v) != digestJSON(expected) {
				return fmt.Errorf("volume was replaced during Fresh deploy: %s", v.Name)
			}
			consumers, e := deploy.Output(ctx, node, "docker", "ps", "-aq", "--filter", "volume="+v.Name)
			if e != nil {
				return e
			}
			if consumers != "" {
				return fmt.Errorf("volume still has consumers: %s", v.Name)
			}
			// Write ahead: after lost acknowledgement, even identical metadata
			// cannot prove that a same-name volume is the original volume.
			if m.Removing == nil {
				m.Removing = map[string]bool{}
			}
			m.Removing[v.Name] = true
			if err = c.saveFreshDeployment(ctx, r.ID, m); err != nil {
				return err
			}
			if _, err = deploy.Output(ctx, node, "docker", "volume", "rm", v.Name); err != nil {
				return err
			}
		}
		m.Completed[expected.Name] = true
		if err = c.saveFreshDeployment(ctx, r.ID, m); err != nil {
			return err
		}
	}
	m.ResetDone = true
	return c.saveFreshDeployment(ctx, r.ID, m)
}

func (c *Controller) freshDeploymentStarted(ctx context.Context, id string) (bool, error) {
	var started bool
	err := c.Store.Pool.QueryRow(ctx, "SELECT COALESCE((value->>'started')::boolean,false) FROM settings WHERE key=$1", freshDeploymentKey(id)).Scan(&started)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return started, nil
}

const freshDeploymentBusySQL = `SELECT EXISTS(SELECT 1 FROM settings s JOIN deployments d ON s.key='fresh-deployment:'||d.id
WHERE d.app_id=$1 AND d.id<>$2 AND d.state IN ('queued','building','deploying') AND s.value->>'started'='true')`

func (c *Controller) stopFreshDeployment(ctx context.Context, r model.Release) error {
	if _, err := c.Store.Pool.Exec(ctx, "UPDATE app_runtime SET status='stopped',updated_at=now() WHERE app_id=$1", r.AppID); err != nil {
		return err
	}
	node, _, err := c.connect(ctx, r.ServerID)
	if err != nil {
		return err
	}
	defer node.Close()
	m, err := c.loadFreshDeployment(ctx, r.ID)
	if err != nil {
		return err
	}
	containers, err := inspectDeletionObjects[deletionContainer](ctx, node, "container")
	if err != nil {
		return err
	}
	owned := map[string]bool{}
	for _, item := range m.Containers {
		owned[item.ID] = true
	}
	var cleanup error
	for _, item := range containers {
		if owned[item.ID] || (item.Config.Labels["shipyard.app"] == r.AppID && item.Config.Labels["shipyard.release"] == r.ID && item.Config.Labels["com.docker.compose.project"] == deploy.Project(r)) {
			_, e := deploy.Output(ctx, node, "docker", "rm", "-f", item.ID)
			cleanup = errors.Join(cleanup, e)
		}
	}
	return errors.Join(cleanup, c.syncProxy(ctx, r.ServerID, nil))
}
