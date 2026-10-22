package control

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

// Deletion manifests contain identities and hashes, never file contents or credentials.
type DeletionItem struct {
	Kind   string `json:"kind"`
	ID     string `json:"id"`
	Name   string `json:"name"`
	Reason string `json:"reason"`
}
type ServerDeletionPlan struct {
	ID         string         `json:"id"`
	ServerID   string         `json:"serverId"`
	ServerName string         `json:"serverName"`
	DaemonID   string         `json:"daemonId"`
	Expires    time.Time      `json:"expiresAt"`
	Remove     []DeletionItem `json:"remove"`
	Preserve   []DeletionItem `json:"preserve"`
	Blockers   []string       `json:"blockers"`
}
type ServerDeletionInput struct {
	PlanID        string `json:"planId"`
	Name          string `json:"name"`
	DeleteVolumes bool   `json:"deleteVolumes"`
}
type deletionContainer struct {
	ID     string `json:"Id"`
	Name   string
	Image  string
	Config struct {
		Image   string
		Labels  map[string]string
		Cmd     []string
		Volumes map[string]json.RawMessage
	}
	HostConfig struct{ NetworkMode string }
	Mounts     []struct {
		Type        string
		Name        string
		Source      string
		Destination string
	}
}
type deletionVolume struct {
	Name      string
	Labels    map[string]string
	CreatedAt string
	Driver    string
	Options   map[string]string
}
type deletionFile struct {
	Path string
	Hash string
}
type serverDeletionManifest struct {
	Plan             ServerDeletionPlan  `json:"plan"`
	Actor            string              `json:"actor"`
	Fingerprint      string              `json:"fingerprint"`
	Database         string              `json:"database"`
	Resources        []string            `json:"resources"`
	Apps             []string            `json:"apps"`
	Routes           []string            `json:"routes"`
	Networks         []string            `json:"networks"`
	Containers       []deletionContainer `json:"containers"`
	Volumes          []deletionVolume    `json:"volumes"`
	CompletedVolumes map[string]bool     `json:"completedVolumes,omitempty"`
	DockerNetworks   []DockerNetwork     `json:"dockerNetworks"`
	Files            []deletionFile      `json:"files"`
	Directories      []string            `json:"directories"`
	Tags             []string            `json:"tags"`
	Images           map[string]string   `json:"images"`
	Proxy            *deletionContainer  `json:"proxy"`
	Stage            string              `json:"stage"`
	Error            string              `json:"error"`
	JobID            string              `json:"jobId"`
	Done             bool                `json:"done"`
}
type ServerDeletionStatus struct {
	Plan  ServerDeletionPlan `json:"plan"`
	Stage string             `json:"stage"`
	Error string             `json:"error"`
	JobID string             `json:"jobId"`
	Done  bool               `json:"done"`
}

func deletionKey(server string) string { return "server-deletion:" + server }
func digestJSON(v any) string {
	b, _ := json.Marshal(v)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

// One connection for all locks avoids exhausting the pool on servers with many apps.
func (c *Controller) deletionLocks(ctx context.Context, ids []string, server string) (func(), error) {
	conn, e := c.Store.Pool.Acquire(ctx)
	if e != nil {
		return nil, e
	}
	keys := []string{}
	for _, id := range ids {
		keys = append(keys, "application-previews:"+id)
	}
	// Callers supply sorted applications followed by sorted routes, matching
	// application cleanup's parent-before-route lock order.
	for _, id := range ids {
		keys = append(keys, "application:"+id)
	}
	keys = append(keys, "server:"+server, "networks:"+server, "proxy:"+server)
	locked := []string{}
	release := func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		for i := len(locked) - 1; i >= 0; i-- {
			_, _ = conn.Exec(cleanup, "SELECT pg_advisory_unlock(hashtextextended($1,0))", locked[i])
		}
		conn.Release()
	}
	for _, key := range keys {
		if _, e = conn.Exec(ctx, "SELECT pg_advisory_lock(hashtextextended($1,0))", key); e != nil {
			release()
			return nil, e
		}
		locked = append(locked, key)
	}
	return release, nil
}

type deletionQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func deletionDatabase(ctx context.Context, q deletionQuerier) (string, error) {
	// Include credentials only in the hash: a connection edit must invalidate approval too.
	var raw []byte
	e := q.QueryRow(ctx, `SELECT jsonb_build_array(
 (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM resources r),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(id,app_id,snapshot,rollback_id) ORDER BY id),'[]') FROM deployments),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(id,snapshot) ORDER BY id),'[]') FROM releases),
 (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY app_id),'[]') FROM app_runtime a),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(route_id,records) ORDER BY route_id),'[]') FROM domain_state))`).Scan(&raw)
	return digestJSON(string(raw)), e
}

func (c *Controller) serverDeletionResources(ctx context.Context, server string) (serverDeletionManifest, error) {
	m := serverDeletionManifest{Plan: ServerDeletionPlan{ID: uuid.NewString(), ServerID: server, Expires: time.Now().Add(15 * time.Minute), Remove: []DeletionItem{}, Preserve: []DeletionItem{}, Blockers: []string{}}}
	host, e := c.Store.Resource(ctx, server)
	if e != nil {
		return m, e
	}
	s, e := model.Decode[model.Server](host)
	if e != nil {
		return m, e
	}
	if host.Kind != "server" || s.Connection == "local" || Protected(server) {
		return m, errors.New("local host and Shipyard infrastructure cannot be deleted")
	}
	if model.IsDeleting(host) {
		return m, db.ErrDeleting
	}
	m.Plan.ServerName = host.Name
	m.Resources = []string{server}
	all, e := c.Store.Resources(ctx, "")
	if e != nil {
		return m, e
	}
	selected := map[string]bool{}
	for _, r := range all {
		if r.Kind == "application" {
			a, _ := model.Decode[model.App](r)
			if a.ServerID == server {
				selected[r.ID] = true
			}
		}
	}
	// Preview descendants are included even if they have not deployed yet.
	for changed := true; changed; {
		changed = false
		for _, r := range all {
			if r.Kind == "application" && !selected[r.ID] {
				a, _ := model.Decode[model.App](r)
				if selected[a.PreviewOf] {
					selected[r.ID] = true
					changed = true
				}
			}
		}
	}
	for _, r := range all {
		include := selected[r.ID] || (r.Kind == "route" && selected[r.ParentID])
		if r.Kind == "network" {
			n, _ := model.Decode[model.Network](r)
			include = n.ServerID == server
			if include {
				m.Networks = append(m.Networks, r.ID)
			}
		}
		if !include {
			continue
		}
		if Protected(r.ID) {
			return m, errors.New("server references protected Shipyard infrastructure")
		}
		if model.IsDeleting(r) {
			return m, fmt.Errorf("%w: %s already has a cleanup operation", db.ErrConflict, r.Name)
		}
		m.Resources = append(m.Resources, r.ID)
		if r.Kind == "application" {
			a, _ := model.Decode[model.App](r)
			if a.ServerID != server {
				return m, fmt.Errorf("%w: preview targets another server", db.ErrConflict)
			}
			m.Apps = append(m.Apps, r.ID)
			m.Plan.Remove = append(m.Plan.Remove, DeletionItem{"application", r.ID, r.Name, "Includes previews, releases and deployment history"})
		}
		if r.Kind == "route" {
			m.Routes = append(m.Routes, r.ID)
			m.Plan.Remove = append(m.Plan.Remove, DeletionItem{"route", r.ID, r.Name, "Owned DNS records and certificate material"})
		}
	}
	sort.Strings(m.Resources)
	sort.Strings(m.Apps)
	sort.Strings(m.Routes)
	sort.Strings(m.Networks)
	m.Database, e = deletionDatabase(ctx, c.Store.Pool)
	return m, e
}

func inspectDeletionObjects[T any](ctx context.Context, node remote.Executor, kind string) ([]T, error) {
	args := []string{"docker", kind, "ls", "-q"}
	if kind == "container" {
		args = []string{"docker", "ps", "-aq"}
	}
	ids, e := deploy.Output(ctx, node, args...)
	if e != nil {
		return nil, e
	}
	if ids == "" {
		return []T{}, nil
	}
	raw, e := deploy.Output(ctx, node, append([]string{"docker", kind, "inspect"}, strings.Fields(ids)...)...)
	if e != nil {
		return nil, e
	}
	var out []T
	e = json.Unmarshal([]byte(raw), &out)
	return out, e
}

func (c *Controller) inventoryServerDeletion(ctx context.Context, m *serverDeletionManifest, node remote.Node) error {
	identity, e := deploy.Output(ctx, node, "docker", "info", "--format", "{{.ID}}")
	if e != nil {
		return e
	}
	if identity == "" {
		return errors.New("Docker daemon identity is unavailable")
	}
	m.Plan.DaemonID = identity
	host, e := c.Store.Resource(ctx, m.Plan.ServerID)
	if e != nil {
		return e
	}
	spec, _ := model.Decode[model.Server](host)
	if spec.DaemonID != "" && spec.DaemonID != identity {
		return errors.New("Docker daemon identity changed")
	}
	otherHosts, err := c.Store.Resources(ctx, "server")
	if err != nil {
		return err
	}
	for _, other := range otherHosts {
		if other.ID == host.ID {
			continue
		}
		s, _ := model.Decode[model.Server](other)
		if s.DaemonID == identity || (spec.Host != "" && s.Host == spec.Host && s.Port == spec.Port) {
			m.Plan.Blockers = append(m.Plan.Blockers, "Docker host has another server registration: "+other.Name)
		}
	}
	appSet, projects, external := map[string]bool{}, map[string]bool{}, map[string]bool{}
	releaseIDs := map[string]bool{}
	for _, id := range m.Apps {
		appSet[id] = true
		projects["sy-"+id] = true
	}
	rows, e := c.Store.Pool.Query(ctx, "SELECT id,app_id,snapshot FROM deployments ORDER BY id")
	if e != nil {
		return e
	}
	for rows.Next() {
		var id, app string
		var encrypted []byte
		if e = rows.Scan(&id, &app, &encrypted); e != nil {
			break
		}
		plain, err := c.Store.Vault.Open(encrypted, "deployment:"+id)
		if err != nil {
			e = err
			break
		}
		var snap DeploymentSnapshot
		if err = json.Unmarshal(plain, &snap); err != nil {
			e = err
			break
		}
		if appSet[app] {
			if snap.App.ServerID != m.Plan.ServerID {
				m.Plan.Blockers = append(m.Plan.Blockers, "Application has deployment files on another server: "+app)
				continue
			}
			releaseIDs[id] = true
			projects["sy-"+id] = true
		} else if snap.App.ServerID == m.Plan.ServerID {
			m.Plan.Blockers = append(m.Plan.Blockers, "Another application's retained deployment still uses this server: "+app)
		}
	}
	rowErr := rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	if rowErr != nil {
		return rowErr
	}
	rows, e = c.Store.Pool.Query(ctx, "SELECT id FROM releases WHERE app_id=ANY($1)", m.Apps)
	if e != nil {
		return e
	}
	var releases []string
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			break
		}
		releases = append(releases, id)
	}
	rowErr = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	if rowErr != nil {
		return rowErr
	}
	for _, id := range releases {
		r, err := c.Store.Release(ctx, id)
		if err != nil {
			return err
		}
		releaseIDs[id] = true
		projects[deploy.Project(r)] = true
		var cfg struct {
			Volumes map[string]struct {
				Name     string
				External bool
			}
		}
		_ = json.Unmarshal([]byte(r.Compose), &cfg)
		for name, v := range cfg.Volumes {
			if v.External {
				if v.Name != "" {
					name = v.Name
				}
				external[name] = true
			}
		}
	}
	m.Images = map[string]string{}
	jobRows, jobErr := c.Store.Pool.Query(ctx, "SELECT a.container FROM job_attempts a JOIN job_runs r ON r.id=a.run_id WHERE r.app_id=ANY($1)", m.Apps)
	if jobErr != nil {
		return jobErr
	}
	for jobRows.Next() {
		var name string
		if jobErr = jobRows.Scan(&name); jobErr != nil {
			jobRows.Close()
			return jobErr
		}
		projects[deploy.JobProject(model.JobAttempt{Container: name})] = true
	}
	jobErr = jobRows.Err()
	jobRows.Close()
	if jobErr != nil {
		return jobErr
	}
	imageList, err := deploy.Output(ctx, node, "docker", "image", "ls", "--no-trunc", "--format", "{{json .}}")
	if err != nil {
		return err
	}
	for _, line := range strings.Split(imageList, "\n") {
		if line == "" {
			continue
		}
		var image struct{ Repository, Tag, ID string }
		if err = json.Unmarshal([]byte(line), &image); err != nil {
			return err
		}
		if !releaseIDs[image.Tag] {
			continue
		}
		for app := range appSet {
			if image.Repository == "shipyard/"+app || strings.HasPrefix(image.Repository, "shipyard/"+app+"-") {
				tag := image.Repository + ":" + image.Tag
				if _, exists := m.Images[tag]; !exists {
					m.Tags = append(m.Tags, tag)
					m.Images[tag] = image.ID
					m.Plan.Remove = append(m.Plan.Remove, DeletionItem{"image", tag, tag, "Owned release tag; shared images are preserved"})
				}
			}
		}
	}
	m.Plan.Preserve = append(m.Plan.Preserve, DeletionItem{"software", "docker", "Docker Engine, Compose and shared images", "Host software and shared image cache are retained"})
	containers, e := inspectDeletionObjects[deletionContainer](ctx, node, "container")
	if e != nil {
		return e
	}
	owned := map[string]bool{}
	binds := []string{}
	for _, item := range containers {
		for _, mount := range item.Mounts {
			if mount.Type == "bind" && !ownedProxy(item) {
				binds = append(binds, mount.Source)
				m.Plan.Preserve = append(m.Plan.Preserve, DeletionItem{"bind", mount.Source, mount.Source, "Bind-mounted data"})
			}
		}
		labels := item.Config.Labels
		project := labels["com.docker.compose.project"]
		if appSet[labels["shipyard.app"]] && projects[project] && releaseIDs[labels["shipyard.release"]] && labels["shipyard.role"] == "" {
			m.Containers = append(m.Containers, item)
			owned[item.ID] = true
			m.Plan.Remove = append(m.Plan.Remove, DeletionItem{"container", item.ID, strings.TrimPrefix(item.Name, "/"), "Managed application container"})
			continue
		}
		if strings.TrimPrefix(item.Name, "/") == "shipyard-haproxy" {
			if !ownedProxy(item) {
				m.Plan.Blockers = append(m.Plan.Blockers, "shipyard-haproxy does not match the managed proxy identity")
				continue
			}
			m.Proxy = &item
			m.Plan.Remove = append(m.Plan.Remove, DeletionItem{"proxy", item.ID, "HAProxy", "Managed host-network proxy"})
			continue
		}
		m.Plan.Preserve = append(m.Plan.Preserve, DeletionItem{"container", item.ID, strings.TrimPrefix(item.Name, "/"), "Unrelated or protected container"})
		if appSet[labels["shipyard.app"]] || projects[project] {
			m.Plan.Blockers = append(m.Plan.Blockers, "Container ownership is ambiguous: "+item.Name)
		}
		if labels["shipyard.app"] != "" && !appSet[labels["shipyard.app"]] {
			m.Plan.Blockers = append(m.Plan.Blockers, "Another Shipyard workload shares this Docker host: "+item.Name)
		}
	}
	volumes, e := inspectDeletionObjects[deletionVolume](ctx, node, "volume")
	if e != nil {
		return e
	}
	for _, v := range volumes {
		if !projects[v.Labels["com.docker.compose.project"]] || external[v.Name] {
			m.Plan.Preserve = append(m.Plan.Preserve, DeletionItem{"volume", v.Name, v.Name, "External, shared or unowned volume"})
			continue
		}
		for _, container := range containers {
			for _, mount := range container.Mounts {
				if mount.Type == "volume" && mount.Name == v.Name && !owned[container.ID] {
					m.Plan.Blockers = append(m.Plan.Blockers, "Volume has an unrelated consumer: "+v.Name)
				}
			}
		}
		m.Volumes = append(m.Volumes, v)
		m.Plan.Remove = append(m.Plan.Remove, DeletionItem{"volume", v.Name, v.Name, "Permanent deletion of owned application data"})
	}
	networks, e := networkInventory(ctx, node)
	if e != nil {
		return e
	}
	known := map[string]model.Network{}
	externalNetworks := map[string]bool{}
	for _, id := range m.Networks {
		r, err := c.Store.Resource(ctx, id)
		if err != nil {
			return err
		}
		s, _ := model.Decode[model.Network](r)
		known[id] = s
		if !s.Managed {
			externalNetworks[s.DockerID] = true
		}
	}
	for _, n := range networks {
		s, registered := known[n.Labels["shipyard.network"]]
		managed := !externalNetworks[n.ID] && ((registered && s.Managed && s.ServerID == m.Plan.ServerID) || projects[n.Labels["com.docker.compose.project"]])
		if !managed {
			m.Plan.Preserve = append(m.Plan.Preserve, DeletionItem{"network", n.ID, n.Name, "External or unowned network"})
			continue
		}
		for id := range n.Containers {
			if !owned[id] {
				m.Plan.Blockers = append(m.Plan.Blockers, "Network has an unrelated attachment: "+n.Name)
			}
		}
		m.DockerNetworks = append(m.DockerNetworks, n)
		m.Plan.Remove = append(m.Plan.Remove, DeletionItem{"network", n.ID, n.Name, "Owned bridge network"})
	}
	for _, id := range m.Routes {
		var raw []byte
		err := c.Store.Pool.QueryRow(ctx, "SELECT records FROM domain_state WHERE route_id=$1", id).Scan(&raw)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		var records []ownedRecord
		_ = json.Unmarshal(raw, &records)
		for _, r := range records {
			item := DeletionItem{"dns", r.ID, r.Name, r.Content}
			var shared bool
			if e = c.Store.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM domain_state WHERE NOT(route_id=ANY($1)) AND records @> $2::jsonb)", m.Routes, fmt.Sprintf(`[{"id":%q}]`, r.ID)).Scan(&shared); e != nil {
				return e
			}
			if r.Owned && !shared {
				m.Plan.Remove = append(m.Plan.Remove, item)
			} else {
				m.Plan.Preserve = append(m.Plan.Preserve, item)
			}
		}
	}
	if e = c.inventoryDeletionFiles(ctx, m, node, releaseIDs, binds); e != nil {
		return e
	}
	sort.Slice(m.Containers, func(i, j int) bool { return m.Containers[i].ID < m.Containers[j].ID })
	sort.Slice(m.Volumes, func(i, j int) bool { return m.Volumes[i].Name < m.Volumes[j].Name })
	sort.Slice(m.DockerNetworks, func(i, j int) bool { return m.DockerNetworks[i].ID < m.DockerNetworks[j].ID })
	sort.Strings(m.Tags)
	m.Fingerprint = digestJSON([]any{m.Database, m.Plan.DaemonID, m.Containers, m.Volumes, m.DockerNetworks, m.Files, m.Directories, m.Images, m.Proxy})
	return nil
}

func ownedProxy(v deletionContainer) bool {
	if strings.TrimPrefix(v.Name, "/") != "shipyard-haproxy" || v.HostConfig.NetworkMode != "host" || v.Config.Labels["shipyard.role"] != "" && v.Config.Labels["shipyard.role"] != "proxy" {
		return false
	}
	if !strings.Contains(strings.Join(v.Config.Cmd, " "), "haproxy -W -db -f /usr/local/etc/haproxy/haproxy.cfg") {
		return false
	}
	config, socket := false, false
	for _, m := range v.Mounts {
		if m.Type != "bind" || m.Source != remote.Root+"/proxy" {
			return false
		}
		config = config || m.Destination == "/usr/local/etc/haproxy"
		socket = socket || m.Destination == "/var/lib/haproxy"
	}
	return config && socket
}

func (c *Controller) inventoryDeletionFiles(ctx context.Context, m *serverDeletionManifest, node remote.Node, releases map[string]bool, binds []string) error {
	root := remote.Root
	out, e := deploy.Output(ctx, node, "sh", "-c", "if [ -e "+remote.Quote(root)+" ]; then [ ! -L "+remote.Quote(root)+" ] || exit 1; find "+remote.Quote(root)+" -xdev \\( -type f -o -type l -o -type s \\) -print0; fi")
	if e != nil {
		return e
	}
	sourceFiles := map[string]string{}
	for id := range releases {
		if _, err := uuid.Parse(id); err != nil {
			return errors.New("invalid release identity")
		}
		file := root + "/releases/" + id + "/.shipyard-files.sha256"
		data, err := deploy.Output(ctx, node, "sh", "-c", safeFileCheck(file)+"; if [ -f "+remote.Quote(file)+" ]; then cat "+remote.Quote(file)+"; fi")
		if err != nil {
			return err
		}
		for _, line := range strings.Split(data, "\n") {
			if len(line) > 66 && line[64:66] == "  " {
				p := line[66:]
				if strings.HasPrefix(p, root+"/releases/"+id+"/source/") && path.Clean(p) == p {
					sourceFiles[p] = line[:64]
				}
			}
		}
	}
	for _, p := range strings.Split(out, "\x00") {
		if p == "" {
			continue
		}
		rel := strings.TrimPrefix(p, root+"/")
		bound := false
		for _, bind := range binds {
			if p == bind || strings.HasPrefix(p, strings.TrimSuffix(bind, "/")+"/") {
				bound = true
			}
		}
		if p == root+"/proxy/admin.sock" && m.Proxy != nil && !bound {
			identity, err := deploy.Output(ctx, node, "sh", "-c", safeFileCheck(p)+"; [ -S "+remote.Quote(p)+" ]; stat -c '%d:%i' "+remote.Quote(p))
			if err != nil {
				return err
			}
			m.Files = append(m.Files, deletionFile{p, "socket:" + identity})
			m.Plan.Remove = append(m.Plan.Remove, DeletionItem{"file", p, p, "Managed HAProxy runtime socket"})
			continue
		}
		parts := strings.Split(rel, "/")
		managed := false
		if len(parts) >= 3 && parts[0] == "releases" && releases[parts[1]] {
			tail := strings.Join(parts[2:], "/")
			managed = tail == "runtime.json" || tail == "build.json" || tail == "build.env" || tail == "auth/config.json" || tail == ".shipyard-files.sha256" || strings.HasPrefix(tail, "secret-") && model.ValidEnv(strings.TrimPrefix(tail, "secret-")) || sourceFiles[p] != ""
		}
		if len(parts) >= 2 && parts[0] == "proxy" && m.Proxy != nil {
			tail := strings.Join(parts[1:], "/")
			managed = tail == "haproxy.cfg" || tail == "previous.cfg" || tail == "candidate.cfg" || tail == "pending"
			for _, dir := range []string{"maps/", "previous-maps/", "certs/", "previous-certs/"} {
				if strings.HasPrefix(tail, dir) {
					base := strings.TrimPrefix(tail, dir)
					if strings.HasSuffix(dir, "maps/") {
						managed = base == "hosts.map" || base == "wildcards.map" || base == "redirects.map"
					} else if strings.HasSuffix(base, ".pem") {
						_, err := uuid.Parse(strings.TrimSuffix(base, ".pem"))
						managed = err == nil
					}
				}
			}
		}
		for _, bind := range binds {
			if p == bind || strings.HasPrefix(p, strings.TrimSuffix(bind, "/")+"/") {
				managed = false
			}
		}
		if !managed || path.Clean(p) != p || strings.ContainsAny(p, "\r\n") {
			m.Plan.Preserve = append(m.Plan.Preserve, DeletionItem{"file", p, p, "Unknown file or bind-mounted data"})
			continue
		}
		hash, err := deploy.Output(ctx, node, "sh", "-c", safeFileCheck(p)+"; sha256sum "+remote.Quote(p))
		if err != nil {
			return err
		}
		if len(hash) < 64 {
			return errors.New("cannot fingerprint managed file")
		}
		hash = hash[:64]
		if wanted := sourceFiles[p]; wanted != "" && wanted != hash {
			m.Plan.Preserve = append(m.Plan.Preserve, DeletionItem{"file", p, p, "Source file changed since transfer"})
			continue
		}
		m.Files = append(m.Files, deletionFile{p, hash})
		m.Plan.Remove = append(m.Plan.Remove, DeletionItem{"file", p, p, "Verified managed file"})
	}
	sort.Slice(m.Files, func(i, j int) bool { return m.Files[i].Path < m.Files[j].Path })
	directories, e := deploy.Output(ctx, node, "sh", "-c", "if [ -d "+remote.Quote(root)+" ]; then find "+remote.Quote(root)+" -xdev -type d -print0; fi")
	if e != nil {
		return e
	}
	for _, dir := range strings.Split(directories, "\x00") {
		if dir == root || dir == root+"/apps" || dir == root+"/releases" || dir == root+"/locks" || dir == root+"/proxy" || dir == root+"/proxy/maps" || dir == root+"/proxy/certs" || dir == root+"/proxy/previous-maps" || dir == root+"/proxy/previous-certs" {
			m.Directories = append(m.Directories, dir)
			m.Plan.Remove = append(m.Plan.Remove, DeletionItem{"directory", dir, dir, "Removed only if empty"})
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(m.Directories)))
	return nil
}

func safeFileCheck(p string) string {
	// Never traverse symlinks, even when a directory was replaced after review.
	checks := []string{"set -eu"}
	for dir := p; dir != "/" && dir != "."; dir = path.Dir(dir) {
		checks = append(checks, "[ ! -L "+remote.Quote(dir)+" ]")
	}
	return strings.Join(checks, "; ")
}

func (c *Controller) PlanServerDeletion(ctx context.Context, server, actor string) (ServerDeletionPlan, error) {
	m, e := c.serverDeletionResources(ctx, server)
	if e != nil {
		return m.Plan, e
	}
	unlock, e := c.deletionLocks(ctx, append(append([]string{}, m.Apps...), m.Routes...), server)
	if e != nil {
		return m.Plan, e
	}
	defer unlock()
	// Re-read after acquiring locks; an operation may have finished while waiting.
	m, e = c.serverDeletionResources(ctx, server)
	if e != nil {
		return m.Plan, e
	}
	node, _, e := c.connect(ctx, server)
	if e != nil {
		return m.Plan, e
	}
	defer node.Close()
	if e = c.inventoryServerDeletion(ctx, &m, node); e != nil {
		return m.Plan, e
	}
	m.Actor = actor
	raw, _ := json.Marshal(m)
	_, e = c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2)", "server-deletion-plan:"+m.Plan.ID, raw)
	return m.Plan, e
}

func (c *Controller) ServerDeletion(ctx context.Context, server string) (ServerDeletionStatus, error) {
	var raw []byte
	e := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", deletionKey(server)).Scan(&raw)
	if e != nil {
		return ServerDeletionStatus{}, e
	}
	var m serverDeletionManifest
	if e = json.Unmarshal(raw, &m); e != nil {
		return ServerDeletionStatus{}, e
	}
	return ServerDeletionStatus{m.Plan, m.Stage, m.Error, m.JobID, m.Done}, nil
}

func (c *Controller) QueueServerDeletion(ctx context.Context, server, actor string, in ServerDeletionInput) (string, error) {
	if c.Store.Maintenance(ctx) {
		return "", errors.New("Shipyard is in maintenance mode")
	}
	var raw []byte
	e := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", "server-deletion-plan:"+in.PlanID).Scan(&raw)
	if e != nil {
		return "", fmt.Errorf("%w: create a fresh deletion plan", db.ErrConflict)
	}
	var approved serverDeletionManifest
	if e = json.Unmarshal(raw, &approved); e != nil {
		return "", e
	}
	if approved.Plan.ServerID != server || approved.Actor != actor || in.Name != approved.Plan.ServerName || !in.DeleteVolumes {
		return "", errors.New("confirm the exact server name and permanent volume deletion")
	}
	if !approved.Plan.Expires.After(time.Now()) || len(approved.Plan.Blockers) > 0 {
		return "", fmt.Errorf("%w: deletion plan expired or has blockers", db.ErrConflict)
	}
	if status, err := c.ServerDeletion(ctx, server); err == nil && status.JobID != "" {
		if status.Plan.ID == in.PlanID {
			return status.JobID, nil
		}
		return "", fmt.Errorf("%w: cleanup already exists; use Retry cleanup", db.ErrConflict)
	}
	unlock, e := c.deletionLocks(ctx, append(append([]string{}, approved.Apps...), approved.Routes...), server)
	if e != nil {
		return "", e
	}
	defer unlock()
	fresh, e := c.serverDeletionResources(ctx, server)
	if e != nil {
		return "", e
	}
	node, _, e := c.connect(ctx, server)
	if e != nil {
		return "", e
	}
	defer node.Close()
	if e = c.inventoryServerDeletion(ctx, &fresh, node); e != nil {
		return "", e
	}
	if fresh.Fingerprint != approved.Fingerprint || len(fresh.Plan.Blockers) > 0 {
		return "", fmt.Errorf("%w: inventory changed; review a fresh deletion plan", db.ErrConflict)
	}
	tx, e := c.Store.Pool.Begin(ctx)
	if e != nil {
		return "", e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(73914231)"); e != nil {
		return "", e
	}
	var updating bool
	if e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM settings WHERE key='platform-update' AND COALESCE(value->>'id','')<>'' AND COALESCE(value->>'state','') NOT IN ('succeeded','rolled_back','failed'))`).Scan(&updating); e != nil {
		return "", e
	}
	if updating {
		return "", fmt.Errorf("%w: a system version change is active or needs recovery", db.ErrConflict)
	}
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); e != nil {
		return "", e
	}
	current, e := deletionDatabase(ctx, tx)
	if e != nil {
		return "", e
	}
	if current != approved.Database {
		return "", fmt.Errorf("%w: resources changed; review a fresh deletion plan", db.ErrConflict)
	}
	approved.JobID = uuid.NewString()
	approved.Stage = "queued"
	raw, _ = json.Marshal(approved)
	if _, e = tx.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2)", deletionKey(server), raw); e != nil {
		return "", e
	}
	if _, e = tx.Exec(ctx, `UPDATE resources SET data=data||jsonb_build_object('deleting',true,'deletionRoot',$2::text,'deletionError',''),version=version+1,updated_at=now() WHERE id=ANY($1)`, approved.Resources, server); e != nil {
		return "", e
	}
	if _, e = tx.Exec(ctx, "UPDATE jobs SET state='done' WHERE resource_id=ANY($1) AND state='queued'", approved.Resources); e != nil {
		return "", e
	}
	if _, e = tx.Exec(ctx, "UPDATE deployments SET state='failed',phase='cancelled',error='Server deletion requested' WHERE app_id=ANY($1) AND state='queued'", approved.Apps); e != nil {
		return "", e
	}
	if _, e = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,dedupe) VALUES($1,'server-delete',$2,$3)", approved.JobID, server, "server-delete:"+server); e != nil {
		return "", e
	}
	if e = tx.Commit(ctx); e != nil {
		return "", e
	}
	_ = c.Store.Audit(ctx, actor, "server.deletion_requested", server, "", map[string]any{"jobId": approved.JobID, "deleteVolumes": true})
	return approved.JobID, nil
}

func (c *Controller) saveServerDeletion(ctx context.Context, m *serverDeletionManifest) error {
	raw, e := json.Marshal(m)
	if e != nil {
		return e
	}
	_, e = c.Store.Pool.Exec(ctx, "UPDATE settings SET value=$2 WHERE key=$1", deletionKey(m.Plan.ServerID), raw)
	return e
}
func (c *Controller) RetryServerDeletion(ctx context.Context, server string) (string, error) {
	if c.Store.Maintenance(ctx) {
		return "", errors.New("Shipyard is in maintenance mode")
	}
	var id string
	e := c.Store.Pool.QueryRow(ctx, `UPDATE jobs SET state='queued',attempts=0,available_at=now(),last_error='',worker=NULL,lease_until=NULL WHERE kind='server-delete' AND resource_id=$1 AND state='failed' RETURNING id`, server).Scan(&id)
	if errors.Is(e, pgx.ErrNoRows) {
		status, err := c.ServerDeletion(ctx, server)
		if err != nil {
			return "", err
		}
		return status.JobID, nil
	}
	return id, e
}

type DeletionConnectionInput struct {
	Host        string            `json:"host"`
	Port        int               `json:"port"`
	User        string            `json:"user"`
	Fingerprint string            `json:"fingerprint"`
	AuthMethod  string            `json:"authMethod"`
	Secrets     map[string]string `json:"secrets"`
}

func (c *Controller) RepairDeletionConnection(ctx context.Context, server string, in DeletionConnectionInput) error {
	if c.Store.Maintenance(ctx) {
		return errors.New("Shipyard is in maintenance mode")
	}
	unlock, e := c.lock(ctx, "deletion:"+server)
	if e != nil {
		return e
	}
	defer unlock()
	status, e := c.ServerDeletion(ctx, server)
	if e != nil {
		return e
	}
	if status.Done || status.Error == "" {
		return errors.New("connection repair is available only after a cleanup failure")
	}
	var running bool
	if e = c.Store.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM jobs WHERE kind='server-delete' AND resource_id=$1 AND state='running')", server).Scan(&running); e != nil {
		return e
	}
	if running {
		return db.ErrConflict
	}
	r, e := c.Store.Resource(ctx, server)
	if e != nil {
		return e
	}
	s, _ := model.Decode[model.Server](r)
	if s.Connection == "local" || Protected(server) {
		return errors.New("protected server")
	}
	s.Host = in.Host
	s.Port = in.Port
	s.User = in.User
	s.Fingerprint = in.Fingerprint
	s.AuthMethod = in.AuthMethod
	data, _ := json.Marshal(s)
	if e = model.Validate(model.ResourceInput{Kind: "server", Name: r.Name, Data: data}); e != nil {
		return e
	}
	secrets, e := c.Store.Secrets(r)
	if e != nil {
		return e
	}
	for k, v := range in.Secrets {
		if k != "private_key" && k != "password" {
			return errors.New("only SSH credentials can be repaired")
		}
		if v != "" {
			secrets[k] = v
		}
	}
	var node remote.Node
	if c.DialNode != nil {
		node, e = c.DialNode(ctx, s, secrets)
	} else {
		node, e = remote.Dial(ctx, s, secrets["private_key"], secrets["password"])
	}
	if e != nil {
		return e
	}
	defer node.Close()
	identity, e := deploy.Output(ctx, node, "docker", "info", "--format", "{{.ID}}")
	if e != nil {
		return e
	}
	if identity != status.Plan.DaemonID {
		return errors.New("repaired connection points to a different Docker daemon")
	}
	raw, _ := json.Marshal(secrets)
	sealed, e := c.Store.Vault.Seal(raw, "resource:"+server)
	if e != nil {
		return e
	}
	_, e = c.Store.Pool.Exec(ctx, "UPDATE resources SET data=data||$2::jsonb,secret=$3,version=version+1,updated_at=now() WHERE id=$1 AND data->>'deleting'='true'", server, data, sealed)
	return e
}

func (c *Controller) deleteServer(ctx context.Context, job model.Job) (result error) {
	var raw []byte
	if e := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", deletionKey(job.ResourceID)).Scan(&raw); e != nil {
		return e
	}
	var m serverDeletionManifest
	if e := json.Unmarshal(raw, &m); e != nil {
		return e
	}
	if m.Done {
		return nil
	}
	defer func() {
		if result != nil {
			cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
			defer cancel()
			m.Error = result.Error()
			_ = c.saveServerDeletion(cleanup, &m)
			_, _ = c.Store.Pool.Exec(cleanup, "UPDATE resources SET data=jsonb_set(data,'{deletionError}',to_jsonb($2::text)) WHERE id=$1", job.ResourceID, result.Error())
			_ = c.Store.Audit(cleanup, m.Actor, "server.deletion_failed", job.ResourceID, "", map[string]string{"error": result.Error(), "stage": m.Stage})
		}
	}()
	unlock, e := c.deletionLocks(ctx, append(append([]string{}, m.Apps...), m.Routes...), job.ResourceID)
	if e != nil {
		return e
	}
	defer unlock()
	node, _, e := c.connect(ctx, job.ResourceID)
	if e != nil {
		return e
	}
	defer node.Close()
	for _, app := range m.Apps {
		if e = c.cancelApplicationJobs(ctx, app); e != nil {
			return e
		}
	}
	verify := func() error {
		id, err := deploy.Output(ctx, node, "docker", "info", "--format", "{{.ID}}")
		if err == nil && id != m.Plan.DaemonID {
			return errors.New("Docker daemon identity changed; cleanup stopped")
		}
		return err
	}
	stage := func(name string) error {
		if err := verify(); err != nil {
			return err
		}
		m.Stage = name
		m.Error = ""
		return c.saveServerDeletion(ctx, &m)
	}
	if e = stage("closing terminals"); e != nil {
		return e
	}
	for _, id := range m.Apps {
		c.CloseApplicationTerminals(id)
	}
	if e = stage("removing DNS records"); e != nil {
		return e
	}
	for _, id := range m.Routes {
		if e = c.DeleteDomain(ctx, id); e != nil {
			return e
		}
	}
	if e = stage("removing application containers"); e != nil {
		return e
	}
	for _, expected := range m.Containers {
		actual, err := inspectDeletionObjects[deletionContainer](ctx, node, "container")
		if err != nil {
			return err
		}
		for _, v := range actual {
			if v.ID == expected.ID {
				if digestJSON(v) != digestJSON(expected) {
					return fmt.Errorf("container ownership changed: %s", expected.Name)
				}
				if _, e = deploy.Output(ctx, node, "docker", "rm", "-f", v.ID); e != nil {
					return e
				}
			}
		}
	}
	if e = stage("removing owned volumes"); e != nil {
		return e
	}
	for _, expected := range m.Volumes {
		if m.CompletedVolumes[expected.Name] {
			continue
		}
		current, err := inspectDeletionObjects[deletionVolume](ctx, node, "volume")
		if err != nil {
			return err
		}
		for _, v := range current {
			if v.Name == expected.Name {
				if digestJSON(v) != digestJSON(expected) {
					return fmt.Errorf("volume ownership changed: %s", v.Name)
				}
				consumers, err := deploy.Output(ctx, node, "docker", "ps", "-aq", "--filter", "volume="+v.Name)
				if err != nil {
					return err
				}
				if consumers != "" {
					return fmt.Errorf("volume has surviving consumers: %s", v.Name)
				}
				if _, e = deploy.Output(ctx, node, "docker", "volume", "rm", v.Name); e != nil {
					return e
				}
			}
		}
		if m.CompletedVolumes == nil {
			m.CompletedVolumes = map[string]bool{}
		}
		m.CompletedVolumes[expected.Name] = true
		if e = c.saveServerDeletion(ctx, &m); e != nil {
			return e
		}
	}
	if e = stage("removing owned networks"); e != nil {
		return e
	}
	for _, expected := range m.DockerNetworks {
		current, err := networkInventory(ctx, node)
		if err != nil {
			return err
		}
		for _, v := range current {
			if v.ID == expected.ID {
				if digestJSON(v.Labels) != digestJSON(expected.Labels) || v.Name != expected.Name || len(v.Containers) > 0 {
					return fmt.Errorf("network ownership or attachments changed: %s", v.Name)
				}
				if _, e = deploy.Output(ctx, node, "docker", "network", "rm", v.ID); e != nil {
					return e
				}
			}
		}
	}
	if e = stage("removing HAProxy"); e != nil {
		return e
	}
	if m.Proxy != nil {
		actual, err := inspectDeletionObjects[deletionContainer](ctx, node, "container")
		if err != nil {
			return err
		}
		for _, v := range actual {
			if v.ID == m.Proxy.ID {
				if !ownedProxy(v) || digestJSON(v) != digestJSON(m.Proxy) {
					return errors.New("HAProxy ownership changed")
				}
				if _, e = deploy.Output(ctx, node, "docker", "rm", "-f", v.ID); e != nil {
					return e
				}
			} else if strings.TrimPrefix(v.Name, "/") == "shipyard-haproxy" {
				return errors.New("HAProxy was replaced; cleanup stopped")
			}
		}
	}
	if e = stage("removing managed files"); e != nil {
		return e
	}
	currentContainers, err := inspectDeletionObjects[deletionContainer](ctx, node, "container")
	if err != nil {
		return err
	}
	for _, container := range currentContainers {
		for _, mount := range container.Mounts {
			if mount.Type != "bind" {
				continue
			}
			for _, file := range m.Files {
				if file.Path == mount.Source || strings.HasPrefix(file.Path, strings.TrimSuffix(mount.Source, "/")+"/") {
					return fmt.Errorf("managed file now has a surviving bind-mount consumer: %s", file.Path)
				}
			}
		}
	}
	for _, f := range m.Files {
		if e = removeDeletionFile(ctx, node, f); e != nil {
			return e
		}
	}
	for _, dir := range m.Directories {
		if _, e = deploy.Output(ctx, node, "sh", "-c", safeFileCheck(dir)+"; if [ -d "+remote.Quote(dir)+" ]; then rmdir -- "+remote.Quote(dir)+" 2>/dev/null || test -d "+remote.Quote(dir)+"; fi"); e != nil {
			return e
		}
	}
	// Removing an owned tag is safe only when no surviving container references its image.
	for _, tag := range m.Tags {
		image, err := deploy.Output(ctx, node, "sh", "-c", "docker image inspect -f '{{.Id}}' "+remote.Quote(tag)+" 2>/dev/null || true")
		if err != nil {
			return err
		}
		if image == "" {
			continue
		}
		if image != m.Images[tag] {
			return fmt.Errorf("release image tag changed: %s", tag)
		}
		consumers, err := deploy.Output(ctx, node, "docker", "ps", "-aq", "--filter", "ancestor="+image)
		if err != nil {
			return err
		}
		if consumers == "" {
			if _, e = deploy.Output(ctx, node, "docker", "image", "rm", tag); e != nil {
				return e
			}
		}
	}
	if e = stage("finalizing records"); e != nil {
		return e
	}
	// No new Shipyard objects may have appeared while cleanup was interrupted.
	remaining, err := inspectDeletionObjects[deletionContainer](ctx, node, "container")
	if err != nil {
		return err
	}
	for _, v := range remaining {
		for _, app := range m.Apps {
			if v.Config.Labels["shipyard.app"] == app {
				return fmt.Errorf("unexpected surviving application container: %s", v.Name)
			}
		}
	}
	remainingNetworks, err := networkInventory(ctx, node)
	if err != nil {
		return err
	}
	for _, network := range remainingNetworks {
		for _, id := range m.Networks {
			if network.Labels["shipyard.network"] == id {
				return fmt.Errorf("unexpected surviving managed network: %s", network.Name)
			}
		}
	}
	remainingVolumes, err := inspectDeletionObjects[deletionVolume](ctx, node, "volume")
	if err != nil {
		return err
	}
	for _, volume := range remainingVolumes {
		if m.CompletedVolumes[volume.Name] {
			return fmt.Errorf("an already removed volume was recreated; it will not be deleted automatically: %s", volume.Name)
		}
	}
	tx, e := c.Store.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); e != nil {
		return e
	}
	if _, err := tx.Exec(ctx, "DELETE FROM settings WHERE (starts_with(key,'deployment-deletion:') OR starts_with(key,'fresh-deployment:')) AND value->>'application'=ANY($1)", m.Apps); err != nil {
		return err
	}
	for _, sql := range []string{"DELETE FROM app_runtime WHERE app_id=ANY($1)", "DELETE FROM releases WHERE app_id=ANY($1)", "DELETE FROM deployments WHERE app_id=ANY($1)"} {
		if _, e = tx.Exec(ctx, sql, m.Apps); e != nil {
			return e
		}
	}
	if _, e = tx.Exec(ctx, "DELETE FROM jobs WHERE resource_id=ANY($1) AND id<>$2", m.Resources, job.ID); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "DELETE FROM alert_state WHERE resource_id=ANY($1)", m.Resources); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "DELETE FROM settings WHERE key=$1 OR (starts_with(key,'server-deletion-plan:') AND value->'plan'->>'serverId'=$2)", "cpu:"+job.ResourceID, job.ResourceID); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, `DELETE FROM settings WHERE key=$1 OR (starts_with(key,'network-lease:') AND (value->>'application'=ANY($2) OR EXISTS(SELECT 1 FROM unnest($3::text[]) id WHERE starts_with(key,'network-lease:'||id||':')))) OR EXISTS(SELECT 1 FROM unnest($2::text[]) id WHERE starts_with(key,'preview-event:'||id||':') OR starts_with(key,'application-volumes:'||id||':')) OR (starts_with(key,'application-volumes:') AND right(key,length($4::text)+1)=':'||$4::text)`, ProxySettingsKey(job.ResourceID), m.Apps, m.Networks, job.ResourceID); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "DELETE FROM resources WHERE id=ANY($1)", m.Resources); e != nil {
		return e
	}
	completed := m
	completed.Stage = "completed"
	completed.Done = true
	completed.Error = ""
	raw, _ = json.Marshal(completed)
	if _, e = tx.Exec(ctx, "UPDATE settings SET value=$2 WHERE key=$1", deletionKey(job.ResourceID), raw); e != nil {
		return e
	}
	detail, _ := json.Marshal(map[string]any{"applications": len(m.Apps), "volumes": len(m.Volumes)})
	if _, e = tx.Exec(ctx, "INSERT INTO audit(user_id,action,resource_id,team_id,detail) VALUES($1,'server.deleted',$2,'',$3)", m.Actor, job.ResourceID, detail); e != nil {
		return e
	}
	if e = tx.Commit(ctx); e != nil {
		return e
	}
	m = completed
	return nil
}

func removeDeletionFile(ctx context.Context, node remote.Executor, f deletionFile) error {
	p := f.Path
	if !strings.HasPrefix(p, remote.Root+"/") || path.Clean(p) != p {
		return errors.New("invalid managed file path")
	}
	script := safeFileCheck(p) + "; if [ -e " + remote.Quote(p) + " ]; then actual=$(sha256sum " + remote.Quote(p) + "); [ \"${actual%% *}\" = " + remote.Quote(f.Hash) + " ] || { echo 'Managed file changed since review'; exit 1; }; rm -- " + remote.Quote(p) + "; fi"
	if strings.HasPrefix(f.Hash, "socket:") {
		script = safeFileCheck(p) + "; if [ -e " + remote.Quote(p) + " ]; then [ -S " + remote.Quote(p) + " ] && [ \"$(stat -c '%d:%i' " + remote.Quote(p) + ")\" = " + remote.Quote(strings.TrimPrefix(f.Hash, "socket:")) + " ] || exit 1; rm -- " + remote.Quote(p) + "; fi"
	}
	if err := node.Run(ctx, remote.Command("sh", "-c", script), nil, io.Discard); err != nil {
		return fmt.Errorf("remove managed file %s: %w", p, err)
	}
	// rmdir never removes data; nonempty directories and unknown files remain.
	for dir := path.Dir(p); strings.HasPrefix(dir, remote.Root); dir = path.Dir(dir) {
		if _, err := deploy.Output(ctx, node, "sh", "-c", safeFileCheck(dir)+"; if [ -d "+remote.Quote(dir)+" ]; then rmdir -- "+remote.Quote(dir)+" 2>/dev/null || test -d "+remote.Quote(dir)+"; fi"); err != nil {
			return err
		}
		if dir == remote.Root {
			break
		}
	}
	return nil
}
