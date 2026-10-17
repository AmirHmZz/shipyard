package db

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"shipyard/internal/db/query"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

//go:embed migrations/*.sql migrations/*.json
var migrations embed.FS

type Store struct {
	Pool  *pgxpool.Pool
	Vault *secure.Vault
}

func Open(ctx context.Context, url string, vault *secure.Vault) (*Store, error) {
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	config.MaxConns = 20
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	s := &Store{pool, vault}
	if err = s.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	if err = s.checkKey(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}
func (s *Store) migrate(ctx context.Context) error {
	state, err := MigrationState(ctx, s.Pool)
	if err != nil {
		return err
	}
	if state.Current == 0 {
		// A fresh database has no existing data to lose.
		return ApplyMigrations(ctx, s.Pool, LatestSchema(), true)
	}
	if state.Current != LatestSchema() {
		return fmt.Errorf("database schema %d does not match binary schema %d; run the planned migration command", state.Current, LatestSchema())
	}
	return nil
}
func (s *Store) checkKey(ctx context.Context) error {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(73914231)"); e != nil {
		return e
	}
	var raw []byte
	e = tx.QueryRow(ctx, "SELECT value FROM settings WHERE key='vault-check'").Scan(&raw)
	if errors.Is(e, pgx.ErrNoRows) {
		sealed, e := s.Vault.Seal([]byte("Shipyard vault v1"), "vault-check")
		if e != nil {
			return e
		}
		raw, _ = json.Marshal(sealed)
		if _, e = tx.Exec(ctx, "INSERT INTO settings(key,value) VALUES('vault-check',$1)", raw); e != nil {
			return e
		}
	} else {
		if e != nil {
			return e
		}
		var sealed []byte
		if e = json.Unmarshal(raw, &sealed); e != nil {
			return e
		}
		plain, e := s.Vault.Open(sealed, "vault-check")
		if e != nil || string(plain) != "Shipyard vault v1" {
			return errors.New("SHIPYARD_MASTER_KEY does not match this database; restore the original key")
		}
	}
	return tx.Commit(ctx)
}

const resourceColumns = `id,kind,CASE WHEN kind='route' THEN COALESCE(data->>'domain',id) ELSE name END AS name,team_id,parent_id,data,secret,version,created_at,updated_at`

func scanResource(row pgx.Row) (model.Resource, error) {
	var r model.Resource
	err := row.Scan(&r.ID, &r.Kind, &r.Name, &r.TeamID, &r.ParentID, &r.Data, &r.Secret, &r.Version, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}
func (s *Store) Resource(ctx context.Context, id string) (model.Resource, error) {
	return scanResource(s.Pool.QueryRow(ctx, "SELECT "+resourceColumns+" FROM resources WHERE id=$1", id))
}
func (s *Store) Resources(ctx context.Context, kind string) ([]model.Resource, error) {
	rows, err := s.Pool.Query(ctx, "SELECT "+resourceColumns+" FROM resources WHERE ($1='' OR kind=$1) ORDER BY created_at", kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Resource{}
	for rows.Next() {
		r, e := scanResource(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (s *Store) Children(ctx context.Context, id, kind string) ([]model.Resource, error) {
	rows, e := s.Pool.Query(ctx, "SELECT "+resourceColumns+" FROM resources WHERE parent_id=$1 AND ($2='' OR kind=$2) ORDER BY created_at", id, kind)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []model.Resource{}
	for rows.Next() {
		r, e := scanResource(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (s *Store) Secrets(r model.Resource) (map[string]string, error) {
	out := map[string]string{}
	if len(r.Secret) == 0 {
		return out, nil
	}
	b, e := s.Vault.Open(r.Secret, "resource:"+r.ID)
	if e != nil {
		return nil, e
	}
	e = json.Unmarshal(b, &out)
	return out, e
}
func (s *Store) Public(r model.Resource) model.Resource {
	m, e := s.Secrets(r)
	r.SecretKeys = []string{}
	if e == nil {
		for k := range m {
			r.SecretKeys = append(r.SecretKeys, k)
		}
		sort.Strings(r.SecretKeys)
	}
	r.Secret = nil
	return r
}
func (s *Store) Save(ctx context.Context, id string, in model.ResourceInput) (model.Resource, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return model.Resource{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return model.Resource{}, err
	}
	if id == "" {
		id = uuid.NewString()
	}
	secrets := map[string]string{}
	old, e := scanResource(tx.QueryRow(ctx, "SELECT "+resourceColumns+" FROM resources WHERE id=$1", id))
	if e == nil {
		secrets, e = s.Secrets(old)
		if e != nil {
			return model.Resource{}, e
		}
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return model.Resource{}, e
	}
	ancestor := in.ParentID
	if old.ID != "" {
		ancestor = old.ID
	}
	var deleting bool
	var metadata struct {
		PreviewOf string `json:"previewOf"`
		ServerID  string `json:"serverId"`
	}
	_ = json.Unmarshal(in.Data, &metadata)
	err = tx.QueryRow(ctx, `WITH RECURSIVE lineage AS (
		SELECT id,parent_id,data FROM resources WHERE id=$1 OR id=$2 OR id=$3
		UNION SELECT p.id,p.parent_id,p.data FROM resources p JOIN lineage c ON c.parent_id=p.id
	) SELECT EXISTS(SELECT 1 FROM lineage WHERE data->>'deleting'='true')`, ancestor, metadata.PreviewOf, metadata.ServerID).Scan(&deleting)
	if err != nil {
		return model.Resource{}, err
	}
	if deleting {
		return model.Resource{}, ErrDeleting
	}
	if in.Kind == "zone" {
		var zone model.Zone
		_ = json.Unmarshal(in.Data, &zone)
		var exists bool
		if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE kind='zone' AND id<>$1 AND parent_id=$2 AND data->>'providerZoneId'=$3)", id, in.ParentID, zone.ProviderZoneID).Scan(&exists); e != nil {
			return model.Resource{}, e
		}
		if exists {
			return model.Resource{}, ErrConflict
		}
	}
	if in.Kind == "route" {
		var route model.Route
		_ = json.Unmarshal(in.Data, &route)
		var reserved bool
		if e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM resources r JOIN resources p ON p.id=r.parent_id WHERE r.kind='route' AND p.kind='system' AND r.id<>$1 AND lower(r.data->>'domain')=lower($2))`, id, route.Domain).Scan(&reserved); e != nil {
			return model.Resource{}, e
		}
		if reserved {
			return model.Resource{}, ErrConflict
		}
	}
	if in.Kind == "application" {
		var app model.App
		_ = json.Unmarshal(in.Data, &app)
		if app.PreviewOf == "" && app.PreviewDomain != "" {
			var exists bool
			if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE kind='application' AND id<>$1 AND COALESCE(data->>'previewOf','')='' AND lower(data->>'previewDomain')=lower($2))", id, app.PreviewDomain).Scan(&exists); e != nil {
				return model.Resource{}, e
			}
			if exists {
				return model.Resource{}, ErrConflict
			}
		}
	}
	for k, v := range in.Secrets {
		if v == "" {
			delete(secrets, k)
		} else {
			secrets[k] = v
		}
	}
	b, e := json.Marshal(secrets)
	if e != nil {
		return model.Resource{}, e
	}
	encrypted, e := s.Vault.Seal(b, "resource:"+id)
	if e != nil {
		return model.Resource{}, e
	}
	var storedName any = in.Name
	if in.Kind == "route" {
		storedName = nil
	}
	if old.ID == "" {
		old, e = scanResource(tx.QueryRow(ctx, "INSERT INTO resources(id,kind,name,team_id,parent_id,data,secret) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING "+resourceColumns, id, in.Kind, storedName, in.TeamID, in.ParentID, in.Data, encrypted))
	} else {
		old, e = scanResource(tx.QueryRow(ctx, "UPDATE resources SET name=$2,data=$3,secret=$4,version=version+1,updated_at=now() WHERE id=$1 AND version=$5 RETURNING "+resourceColumns, id, storedName, in.Data, encrypted, in.Version))
	}
	if e != nil {
		return model.Resource{}, e
	}
	return old, tx.Commit(ctx)
}
func (s *Store) Project(ctx context.Context, r model.Resource) (model.Resource, error) {
	for i := 0; i < 8; i++ {
		if r.Kind == "project" {
			return r, nil
		}
		if r.ParentID == "" {
			break
		}
		var e error
		r, e = s.Resource(ctx, r.ParentID)
		if e != nil {
			return r, e
		}
	}
	return model.Resource{}, pgx.ErrNoRows
}
func (s *Store) TeamOwner(ctx context.Context, user, team string) bool {
	var yes bool
	e := s.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id=$1 AND user_id=$2 AND role='owner')", team, user).Scan(&yes)
	return e == nil && yes
}

// Access is used for reads, writes and every streaming connection. No UI state is trusted.
func (s *Store) Access(ctx context.Context, u model.User, r model.Resource, write bool) bool {
	if u.Admin {
		return true
	}
	if r.Kind == "server" || r.Kind == "git" || r.Kind == "dns" || r.Kind == "zone" || r.Kind == "network" {
		if write {
			return false
		}
		return s.Granted(ctx, u.ID, r.ID)
	}
	if r.TeamID == "" {
		return false
	}
	if s.TeamOwner(ctx, u.ID, r.TeamID) {
		return true
	}
	if r.Kind == "team" {
		var yes bool
		e := s.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id=$1 AND user_id=$2)", r.ID, u.ID).Scan(&yes)
		return !write && e == nil && yes
	}
	p, e := s.Project(ctx, r)
	if e != nil {
		return false
	}
	var role string
	if s.Pool.QueryRow(ctx, "SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2", p.ID, u.ID).Scan(&role) != nil {
		return false
	}
	return !write || role == "owner" || role == "operator"
}
func (s *Store) Granted(ctx context.Context, user, id string) bool {
	var yes bool
	e := s.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM resource_grants g JOIN team_members m ON m.team_id=g.team_id WHERE g.resource_id=$1 AND m.user_id=$2)`, id, user).Scan(&yes)
	return e == nil && yes
}
func (s *Store) TeamGranted(ctx context.Context, team, id string) bool {
	yes, e := query.New(s.Pool).ResourceGranted(ctx, query.ResourceGrantedParams{ResourceID: id, TeamID: team})
	return e == nil && yes
}
func (s *Store) Maintenance(ctx context.Context) bool {
	var value bool
	err := s.Pool.QueryRow(ctx, "SELECT value::boolean FROM settings WHERE key='maintenance'").Scan(&value)
	return err != nil || value
}
func (s *Store) Audit(ctx context.Context, u, action, id, team string, detail any) error {
	b, e := json.Marshal(detail)
	if e != nil {
		return e
	}
	_, e = s.Pool.Exec(ctx, "INSERT INTO audit(user_id,action,resource_id,team_id,detail) VALUES($1,$2,$3,$4,$5)", u, action, id, team, b)
	return e
}
func (s *Store) Enqueue(ctx context.Context, kind, id, dedupe string, payload any) error {
	b, e := json.Marshal(payload)
	if e != nil {
		return e
	}
	_, e = s.Pool.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe) DO NOTHING", uuid.NewString(), kind, id, b, dedupe)
	return e
}
func (s *Store) Claim(ctx context.Context, worker string, kinds ...string) (model.Job, error) {
	var j model.Job
	err := s.Pool.QueryRow(ctx, `UPDATE jobs SET state='running',worker=$1,lease_until=now()+interval '90 seconds',attempts=attempts+1 WHERE id=(SELECT id FROM jobs WHERE (state='queued' OR (state='running' AND lease_until<now())) AND available_at<=now() AND ($2::text[] IS NULL OR kind=ANY($2)) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,kind,resource_id,payload,attempts`, worker, kinds).Scan(&j.ID, &j.Kind, &j.ResourceID, &j.Payload, &j.Attempts)
	return j, err
}
func (s *Store) Finish(ctx context.Context, j model.Job, worker string, err error) error {
	state, msg := "done", ""
	delay := 0
	if err != nil {
		msg = err.Error()
		state = "failed"
		if j.Kind != "deploy" && j.Kind != "proxy-settings" && j.Attempts < 6 {
			state = "queued"
			delay = 1 << j.Attempts
		}
		if j.Kind == "deploy" {
			var resume bool
			_ = s.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM deployments WHERE id=$1::jsonb->>'deploymentId' AND state='queued' AND phase='reconcile')", j.Payload).Scan(&resume)
			if resume {
				state = "queued"
				shift := j.Attempts
				if shift > 8 {
					shift = 8
				}
				delay = 1 << shift
			}
		}
	}
	_, e := s.Pool.Exec(ctx, "UPDATE jobs SET state=$3,last_error=$4,available_at=now()+make_interval(secs=>$5),lease_until=NULL WHERE id=$1 AND worker=$2", j.ID, worker, state, msg, delay)
	return e
}
func (s *Store) Event(ctx context.Context, id, msg string) {
	if len(msg) > 16384 {
		msg = msg[:16384]
	}
	_, _ = s.Pool.Exec(ctx, "INSERT INTO events(deployment_id,message) VALUES($1,$2)", id, msg)
}
func (s *Store) Events(ctx context.Context, id string, after int64) ([]model.Event, error) {
	rows, e := s.Pool.Query(ctx, "SELECT id,deployment_id,message,created_at FROM events WHERE deployment_id=$1 AND id>$2 ORDER BY id LIMIT 500", id, after)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []model.Event{}
	for rows.Next() {
		var v model.Event
		if e = rows.Scan(&v.ID, &v.DeploymentID, &v.Message, &v.CreatedAt); e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

const deploymentColumns = `id,app_id,state,phase,commit_sha,error,release_id,rollback_id,created_at,updated_at`

func scanDeployment(row pgx.Row) (model.Deployment, error) {
	var d model.Deployment
	e := row.Scan(&d.ID, &d.AppID, &d.State, &d.Phase, &d.Commit, &d.Error, &d.ReleaseID, &d.RollbackID, &d.CreatedAt, &d.UpdatedAt)
	return d, e
}
func (s *Store) Deployment(ctx context.Context, id string) (model.Deployment, error) {
	return scanDeployment(s.Pool.QueryRow(ctx, "SELECT "+deploymentColumns+" FROM deployments WHERE id=$1", id))
}
func (s *Store) Deployments(ctx context.Context, id string) ([]model.Deployment, error) {
	rows, e := s.Pool.Query(ctx, "SELECT "+deploymentColumns+" FROM deployments WHERE ($1='' OR app_id=$1) ORDER BY created_at DESC LIMIT 200", id)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []model.Deployment{}
	for rows.Next() {
		d, e := scanDeployment(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
func (s *Store) Stage(ctx context.Context, id, state, phase, msg string) error {
	_, e := s.Pool.Exec(ctx, "UPDATE deployments SET state=$2,phase=$3,error=$4,updated_at=now() WHERE id=$1", id, state, phase, msg)
	return e
}
func (s *Store) Release(ctx context.Context, id string) (model.Release, error) {
	var data []byte
	err := s.Pool.QueryRow(ctx, "SELECT snapshot FROM releases WHERE id=$1", id).Scan(&data)
	if err != nil {
		return model.Release{}, err
	}
	b, err := s.Vault.Open(data, "release:"+id)
	if err != nil {
		return model.Release{}, err
	}
	var env model.ReleaseEnvelope
	err = json.Unmarshal(b, &env)
	env.Release.Env = env.Env
	env.Release.BuildSecrets = env.BuildSecrets
	return env.Release, err
}
func (s *Store) Active(ctx context.Context, app string) (model.Release, error) {
	var id string
	var runtime []byte
	e := s.Pool.QueryRow(ctx, "SELECT release_id,runtime FROM app_runtime WHERE app_id=$1", app).Scan(&id, &runtime)
	if e != nil {
		return model.Release{}, e
	}
	r, e := s.Release(ctx, id)
	if e != nil {
		return r, e
	}
	var live struct {
		Containers []string       `json:"containers"`
		Targets    []model.Target `json:"targets"`
	}
	if json.Unmarshal(runtime, &live) == nil && len(live.Containers) > 0 {
		r.Containers = live.Containers
		r.Targets = live.Targets
	}
	return r, nil
}
func (s *Store) UpdateRuntime(ctx context.Context, r model.Release) error {
	b, _ := json.Marshal(map[string]any{"containers": r.Containers, "targets": r.Targets})
	_, e := s.Pool.Exec(ctx, "UPDATE app_runtime SET runtime=$2,updated_at=now() WHERE app_id=$1 AND release_id=$3", r.AppID, b, r.ID)
	return e
}
func (s *Store) SaveRelease(ctx context.Context, r model.Release) error {
	b, e := json.Marshal(model.ReleaseEnvelope{Release: r, Env: r.Env, BuildSecrets: r.BuildSecrets})
	if e != nil {
		return e
	}
	encrypted, e := s.Vault.Seal(b, "release:"+r.ID)
	if e != nil {
		return e
	}
	_, e = s.Pool.Exec(ctx, "INSERT INTO releases(id,app_id,deployment_id,snapshot) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING", r.ID, r.AppID, r.DeploymentID, encrypted)
	return e
}

// Only operational network identities are completed after containers are
// created. Image, source, configuration and secret snapshots stay immutable.
func (s *Store) SaveReleaseNetworks(ctx context.Context, r model.Release) error {
	var encrypted []byte
	if err := s.Pool.QueryRow(ctx, "SELECT snapshot FROM releases WHERE id=$1", r.ID).Scan(&encrypted); err != nil {
		return err
	}
	raw, err := s.Vault.Open(encrypted, "release:"+r.ID)
	if err != nil {
		return err
	}
	var envelope model.ReleaseEnvelope
	if err = json.Unmarshal(raw, &envelope); err != nil {
		return err
	}
	envelope.Release.Networks = r.Networks
	raw, err = json.Marshal(envelope)
	if err != nil {
		return err
	}
	encrypted, err = s.Vault.Seal(raw, "release:"+r.ID)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx, "UPDATE releases SET snapshot=$2 WHERE id=$1", r.ID, encrypted)
	return err
}
func (s *Store) Activate(ctx context.Context, r model.Release) error {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	runtime, _ := json.Marshal(map[string]any{"containers": r.Containers, "targets": r.Targets})
	if _, e = tx.Exec(ctx, "INSERT INTO app_runtime(app_id,release_id,runtime) VALUES($1,$2,$3) ON CONFLICT(app_id) DO UPDATE SET release_id=$2,status='running',runtime=$3,updated_at=now()", r.AppID, r.ID, runtime); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "UPDATE deployments SET state='healthy',phase='complete',release_id=$2,commit_sha=$3,error='',updated_at=now() WHERE id=$1", r.DeploymentID, r.ID, r.Commit); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) Retention(ctx context.Context) error {
	if _, e := s.Pool.Exec(ctx, "DELETE FROM settings WHERE starts_with(key,'server-deletion-plan:') AND (value->'plan'->>'expiresAt')::timestamptz < now()"); e != nil {
		return e
	}
	if _, e := s.Pool.Exec(ctx, "DELETE FROM settings WHERE key LIKE 'http01:%' AND (value->>'expires')::timestamptz < now()"); e != nil {
		return e
	}
	if _, err := s.Pool.Exec(ctx, "DELETE FROM jobs WHERE state IN ('done','failed') AND created_at<now()-interval '30 days' AND NOT(kind IN ('resource-delete','server-delete') AND EXISTS(SELECT 1 FROM resources WHERE id=jobs.resource_id AND data->>'deleting'='true'))"); err != nil {
		return err
	}
	for _, q := range []string{"DELETE FROM metrics WHERE created_at<now()-interval '7 days'", "DELETE FROM events WHERE created_at<now()-interval '30 days'", "DELETE FROM audit WHERE created_at<now()-interval '90 days'", "DELETE FROM sessions WHERE expires_at<now()", "DELETE FROM invitations WHERE expires_at<now()", "DELETE FROM webhook_deliveries WHERE created_at<now()-interval '30 days'"} {
		if _, e := s.Pool.Exec(ctx, q); e != nil {
			return e
		}
	}
	return nil
}
func (s *Store) Ping(ctx context.Context) error { return s.Pool.Ping(ctx) }
func NowID() string                             { return fmt.Sprintf("%d-%s", time.Now().Unix(), uuid.NewString()[:8]) }
