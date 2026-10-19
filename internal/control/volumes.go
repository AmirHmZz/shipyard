package control

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"sort"
	"time"
)

type VolumeMount struct {
	Service   string `json:"service"`
	Container string `json:"container"`
	Path      string `json:"path"`
}
type ApplicationVolume struct {
	Name       string        `json:"name"`
	ServerID   string        `json:"serverId"`
	ServerName string        `json:"serverName"`
	Type       string        `json:"type"`
	Driver     string        `json:"driver"`
	CreatedAt  string        `json:"createdAt"`
	Mounts     []VolumeMount `json:"mounts"`
	InUse      bool          `json:"inUse"`
	SizeBytes  *int64        `json:"sizeBytes"`
	MeasuredAt *time.Time    `json:"measuredAt"`
}
type VolumeServerError struct {
	ServerID string `json:"serverId"`
	Error    string `json:"error"`
}
type ApplicationVolumes struct {
	Volumes []ApplicationVolume `json:"volumes"`
	Errors  []VolumeServerError `json:"errors"`
}
type trackedVolume struct {
	Volume      ApplicationVolume `json:"volume"`
	Fingerprint string            `json:"fingerprint"`
}
type volumeLedger struct {
	Daemon  string          `json:"daemon"`
	Volumes []trackedVolume `json:"volumes"`
}
type volumeUsageCache struct {
	Sizes map[string]int64
	At    time.Time
}

func volumeLedgerKey(app, server string) string { return "application-volumes:" + app + ":" + server }
func volumeFingerprint(v deletionVolume) string { return digestJSON(v) }

func (c *Controller) retainedVolumeReleases(ctx context.Context) ([]model.Release, error) {
	rows, err := c.Store.Pool.Query(ctx, "SELECT id FROM releases")
	if err != nil {
		return nil, err
	}
	ids := []string{}
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
	releases := []model.Release{}
	for _, id := range ids {
		r, e := c.Store.Release(ctx, id)
		if errors.Is(e, pgx.ErrNoRows) {
			continue
		}
		if e != nil {
			return nil, e
		}
		releases = append(releases, r)
	}
	return releases, nil
}

func (c *Controller) loadVolumeLedger(ctx context.Context, app, server string) (volumeLedger, error) {
	var raw []byte
	err := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", volumeLedgerKey(app, server)).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return volumeLedger{}, nil
	}
	if err != nil {
		return volumeLedger{}, err
	}
	var ledger volumeLedger
	err = json.Unmarshal(raw, &ledger)
	return ledger, err
}

// Used only for display attribution. Fresh deploy and deletion keep their own
// stricter live inventories and never use this ledger as deletion authority.
func ownedApplicationVolumes(app, server string, releases []model.Release, containers []deletionContainer, volumes []deletionVolume, ledger volumeLedger) ([]trackedVolume, error) {
	projects := map[string]bool{"sy-" + app: true}
	known := map[string]model.Release{}
	external, other := map[string]bool{}, map[string]bool{}
	for _, r := range releases {
		if r.ServerID != server {
			continue
		}
		ext, names, _, err := composeVolumeNames(r)
		if err != nil {
			return nil, err
		}
		for name := range ext {
			external[name] = true
		}
		if r.AppID == app {
			known[r.ID] = r
			projects[deploy.Project(r)] = true
		} else {
			for name := range names {
				other[name] = true
			}
		}
	}
	owned := map[string]bool{}
	mounts := map[string][]VolumeMount{}
	anonymous := map[string]bool{}
	for _, ctr := range containers {
		labels := ctr.Config.Labels
		r, ok := known[labels["shipyard.release"]]
		if !ok || labels["shipyard.app"] != app || labels["com.docker.compose.project"] != deploy.Project(r) || labels["shipyard.role"] != "" {
			continue
		}
		owned[ctr.ID] = true
		_, names, targets, err := composeVolumeNames(r)
		if err != nil {
			return nil, err
		}
		for _, m := range ctr.Mounts {
			if m.Type != "volume" {
				continue
			}
			if !names[m.Name] {
				_, imageVolume := ctr.Config.Volumes[m.Destination]
				_, hexErr := hex.DecodeString(m.Name)
				if len(m.Name) == 64 && hexErr == nil && (imageVolume || targets[labels["com.docker.compose.service"]][m.Destination]) {
					anonymous[m.Name] = true
				}
			}
			mounts[m.Name] = append(mounts[m.Name], VolumeMount{Service: labels["com.docker.compose.service"], Container: ctr.ID, Path: m.Destination})
		}
	}
	shared := map[string]bool{}
	for _, ctr := range containers {
		if !owned[ctr.ID] {
			for _, m := range ctr.Mounts {
				if m.Type == "volume" {
					shared[m.Name] = true
				}
			}
		}
	}
	previous := map[string]trackedVolume{}
	for _, v := range ledger.Volumes {
		previous[v.Volume.Name] = v
	}
	result := []trackedVolume{}
	for _, v := range volumes {
		if external[v.Name] || other[v.Name] || shared[v.Name] {
			continue
		}
		prior, recorded := previous[v.Name]
		fingerprint := volumeFingerprint(v)
		// A replaced name cannot inherit historical attribution.
		if recorded && prior.Fingerprint != fingerprint {
			if len(mounts[v.Name]) == 0 {
				continue
			}
			recorded = false
		}
		if !projects[v.Labels["com.docker.compose.project"]] && !anonymous[v.Name] && !recorded {
			continue
		}
		kind := "named"
		if anonymous[v.Name] || recorded && prior.Volume.Type == "anonymous" {
			kind = "anonymous"
		}
		associations := mounts[v.Name]
		inUse := len(associations) > 0
		if len(associations) == 0 && recorded {
			associations = prior.Volume.Mounts
		}
		if associations == nil {
			associations = []VolumeMount{}
		}
		result = append(result, trackedVolume{Volume: ApplicationVolume{Name: v.Name, ServerID: server, Type: kind, Driver: v.Driver, CreatedAt: v.CreatedAt, Mounts: associations, InUse: inUse}, Fingerprint: fingerprint})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Volume.Name < result[j].Volume.Name })
	return result, nil
}

func (c *Controller) inspectApplicationVolumes(ctx context.Context, node remote.Node, app, server string, releases []model.Release) (string, []trackedVolume, error) {
	daemon, err := deploy.Output(ctx, node, "docker", "info", "--format", "{{.ID}}")
	if err != nil {
		return "", nil, err
	}
	if daemon == "" {
		return "", nil, errors.New("Docker identity unavailable")
	}
	host, err := c.Store.Resource(ctx, server)
	if err != nil {
		return "", nil, err
	}
	spec, err := model.Decode[model.Server](host)
	if err != nil {
		return "", nil, err
	}
	if spec.DaemonID != "" && spec.DaemonID != daemon {
		return "", nil, errors.New("Docker host identity changed")
	}
	ledger, err := c.loadVolumeLedger(ctx, app, server)
	if err != nil {
		return "", nil, err
	}
	if ledger.Daemon != daemon {
		ledger = volumeLedger{}
	}
	containers, err := inspectDeletionObjects[deletionContainer](ctx, node, "container")
	if err != nil {
		return "", nil, err
	}
	volumes, err := inspectDeletionObjects[deletionVolume](ctx, node, "volume")
	if err != nil {
		return "", nil, err
	}
	items, err := ownedApplicationVolumes(app, server, releases, containers, volumes, ledger)
	return daemon, items, err
}

func (c *Controller) recordApplicationVolumes(ctx context.Context, node remote.Node, r model.Release) error {
	releases, err := c.retainedVolumeReleases(ctx)
	if err != nil {
		return err
	}
	daemon, items, err := c.inspectApplicationVolumes(ctx, node, r.AppID, r.ServerID, releases)
	if err != nil {
		return err
	}
	// Missing timestamps cannot reliably identify an unused volume later.
	kept := []trackedVolume{}
	for _, v := range items {
		if v.Volume.CreatedAt != "" {
			kept = append(kept, v)
		}
	}
	previous, err := c.loadVolumeLedger(ctx, r.AppID, r.ServerID)
	if err != nil {
		return err
	}
	merged := map[string]trackedVolume{}
	if previous.Daemon == daemon {
		for _, v := range previous.Volumes {
			merged[v.Volume.Name] = v
		}
	}
	for _, v := range kept {
		merged[v.Volume.Name] = v
	}
	kept = []trackedVolume{}
	for _, v := range merged {
		kept = append(kept, v)
	}
	sort.Slice(kept, func(i, j int) bool { return kept[i].Volume.Name < kept[j].Volume.Name })
	raw, err := json.Marshal(volumeLedger{Daemon: daemon, Volumes: kept})
	if err != nil {
		return err
	}
	_, err = c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", volumeLedgerKey(r.AppID, r.ServerID), raw)
	return err
}

func (c *Controller) cachedVolumeUsage(ctx context.Context, node remote.Node, daemon string) (volumeUsageCache, error) {
	c.volumeUsageMu.Lock()
	defer c.volumeUsageMu.Unlock()
	if cached, ok := c.volumeUsage[daemon]; ok && time.Since(cached.At) < 30*time.Second {
		return cached, nil
	}
	probe, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	sizes, err := remote.VolumeUsage(probe, node)
	if err != nil {
		return volumeUsageCache{}, err
	}
	if c.volumeUsage == nil {
		c.volumeUsage = map[string]volumeUsageCache{}
	}
	entry := volumeUsageCache{Sizes: sizes, At: time.Now()}
	c.volumeUsage[daemon] = entry
	return entry, nil
}

func (c *Controller) ApplicationVolumes(ctx context.Context, app model.Resource) (ApplicationVolumes, error) {
	result := ApplicationVolumes{Volumes: []ApplicationVolume{}, Errors: []VolumeServerError{}}
	spec, err := model.Decode[model.App](app)
	if err != nil {
		return result, err
	}
	releases, err := c.retainedVolumeReleases(ctx)
	if err != nil {
		return result, err
	}
	servers := map[string]bool{spec.ServerID: true}
	for _, r := range releases {
		if r.AppID == app.ID {
			servers[r.ServerID] = true
		}
	}
	rows, err := c.Store.Pool.Query(ctx, "SELECT key FROM settings WHERE starts_with(key,$1)", "application-volumes:"+app.ID+":")
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var key string
		if err = rows.Scan(&key); err != nil {
			rows.Close()
			return result, err
		}
		servers[key[len("application-volumes:"+app.ID+":"):]] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	ids := []string{}
	for id := range servers {
		if id != "" {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	for _, server := range ids {
		func() {
			probe, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			node, host, e := c.connect(probe, server)
			if e != nil {
				result.Errors = append(result.Errors, VolumeServerError{server, "Unable to connect to storage server"})
				return
			}
			defer node.Close()
			daemon, items, e := c.inspectApplicationVolumes(probe, node, app.ID, server, releases)
			if e != nil {
				result.Errors = append(result.Errors, VolumeServerError{server, "Unable to inspect application volumes"})
				return
			}
			usage, e := c.cachedVolumeUsage(probe, node, daemon)
			if e != nil {
				result.Errors = append(result.Errors, VolumeServerError{server, "Volume sizes are unavailable"})
			}
			for _, item := range items {
				v := item.Volume
				v.ServerName = host.Name
				if size, ok := usage.Sizes[v.Name]; ok {
					v.SizeBytes = &size
					at := usage.At
					v.MeasuredAt = &at
				}
				result.Volumes = append(result.Volumes, v)
			}
		}()
	}
	return result, nil
}
