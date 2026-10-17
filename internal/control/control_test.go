package control

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"io"
	"log/slog"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/secure"
	"shipyard/internal/testdb"
	"strings"
	"testing"
	"time"
)

func testController(t *testing.T) *Controller {
	t.Helper()
	v, _ := secure.New(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	s, e := db.Open(context.Background(), testdb.URL(t), v)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(s.Pool.Close)
	return &Controller{Store: s, DataDir: t.TempDir(), Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
}
func resource(t *testing.T, c *Controller, kind, parent, team string, data any, secrets map[string]string) model.Resource {
	t.Helper()
	b, _ := json.Marshal(data)
	r, e := c.Store.Save(context.Background(), "", model.ResourceInput{Kind: kind, Name: kind, ParentID: parent, TeamID: team, Data: b, Secrets: secrets})
	if e != nil {
		t.Fatal(e)
	}
	return r
}
func TestPreviewSecretsAndQueueDedupe(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	team := uuid.NewString()
	_, _ = c.Store.Save(ctx, team, model.ResourceInput{Kind: "team", Name: "test", TeamID: team, Data: json.RawMessage(`{}`)})
	project := resource(t, c, "project", "", team, map[string]any{}, map[string]string{"env:PRODUCTION": "private", "preview-env:PREVIEW": "allowed"})
	env := resource(t, c, "environment", project.ID, team, map[string]any{}, map[string]string{"env:PROD_DB": "secret"})
	server := resource(t, c, "server", "", "", model.Server{}, nil)
	git := resource(t, c, "git", "", "", model.Git{}, nil)
	for _, id := range []string{server.ID, git.ID} {
		_, _ = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team)
	}
	source := resource(t, c, "application", env.ID, team, model.App{Previews: true}, nil)
	sha := strings.Repeat("a", 40)
	spec := model.App{Engine: "dockerfile", ServerID: server.ID, GitID: git.ID, Branch: "main", PreviewOf: source.ID, PreviewSHA: sha, ApprovedSHA: sha, Context: ".", File: "Dockerfile"}
	app := resource(t, c, "application", env.ID, team, spec, map[string]string{"env:PREVIEW_LOCAL": "yes"})
	first, e := c.queue(ctx, app, sha, "", "one-hook")
	if e != nil {
		t.Fatal(e)
	}
	second, e := c.queue(ctx, app, sha, "", "one-hook")
	if e != nil || first.ID != second.ID {
		t.Fatal("delivery retry created another deployment", e)
	}
	var encrypted []byte
	_ = c.Store.Pool.QueryRow(ctx, "SELECT snapshot FROM deployments WHERE id=$1", first.ID).Scan(&encrypted)
	b, e := c.Store.Vault.Open(encrypted, "deployment:"+first.ID)
	if e != nil {
		t.Fatal(e)
	}
	var snapshot DeploymentSnapshot
	_ = json.Unmarshal(b, &snapshot)
	if snapshot.Env["PRODUCTION"] != "" || snapshot.Env["PROD_DB"] != "" || snapshot.Env["PREVIEW"] != "allowed" || snapshot.Env["PREVIEW_LOCAL"] != "yes" {
		t.Fatal("preview secret inheritance failed", snapshot.Env)
	}
	if _, err := c.Queue(ctx, app, "main", ""); err == nil {
		t.Fatal("preview branch bypassed exact-commit approval")
	}
}

func TestAlertPolicyDeduplicationAndRecovery(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	resource(t, c, "webhook", "", "", model.Webhook{URL: "https://hooks.invalid", Events: []string{"*"}}, nil)
	p := c.AlertPolicy(ctx)
	p.Memory = 80
	if err := c.SetAlertPolicy(ctx, p); err != nil {
		t.Fatal(err)
	}
	if c.AlertPolicy(ctx).Memory != 80 {
		t.Fatal("policy did not persist")
	}
	p.CPU = 101
	if err := c.SetAlertPolicy(ctx, p); err == nil {
		t.Fatal("invalid percentage accepted")
	}
	if err := c.alert(ctx, "host", "resource.high", true, time.Minute, map[string]any{"cpu": 99}); err != nil {
		t.Fatal(err)
	}
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE alert_state SET since=now()-interval '2 minutes'")
	for i := 0; i < 3; i++ {
		if err := c.alert(ctx, "host", "resource.high", true, time.Minute, map[string]any{"cpu": 99 - i}); err != nil {
			t.Fatal(err)
		}
	}
	if err := c.alert(ctx, "host", "resource.high", false, time.Minute, map[string]any{"cpu": 20}); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='notify'").Scan(&n)
	if n != 2 {
		t.Fatalf("wanted one alert and one recovery, got %d", n)
	}
}

func TestApplicationMetricsExcludeOtherContainers(t *testing.T) {
	server := Metric{Containers: []ContainerMetric{{ID: "aaaaaaaaaaaa", CPU: 12}, {ID: "bbbbbbbbbbbb", CPU: 77}, {ID: "", CPU: 99}}}
	point := applicationMetric(server, model.Release{AppID: "own", Containers: []string{strings.Repeat("a", 64)}})
	if point.ResourceID != "own" || point.CPU != 12 || len(point.Containers) != 1 {
		t.Fatal("metrics crossed application boundary", point)
	}
}

func TestForkApprovalAndStalePreviewEvents(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	project := resource(t, c, "project", team.ID, team.ID, map[string]any{}, nil)
	environment := resource(t, c, "environment", project.ID, team.ID, map[string]any{}, nil)
	dns := resource(t, c, "dns", "", "", model.DNS{Provider: "cloudflare"}, nil)
	zone := resource(t, c, "zone", dns.ID, "", model.Zone{Domain: "example.com", ProviderZoneID: "zone"}, nil)
	server := resource(t, c, "server", "", "", model.Server{}, nil)
	git := resource(t, c, "git", "", "", model.Git{Provider: "gitea", URL: "https://git.invalid"}, nil)
	for _, id := range []string{server.ID, git.ID, zone.ID} {
		if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team.ID); err != nil {
			t.Fatal(err)
		}
	}
	spec := model.App{Engine: "dockerfile", ServerID: server.ID, GitID: git.ID, Repository: "owner/repo", Branch: "main", Context: ".", File: "Dockerfile", Port: 8080, Previews: true, PreviewDomain: "*.preview.example.com", PreviewZoneID: zone.ID}
	app := resource(t, c, "application", environment.ID, team.ID, spec, nil)
	event := providers.GitEvent{PR: 1, Action: "opened", Repository: "owner/repo", HeadRepo: "fork/repo", HeadBranch: "change", HeadSHA: strings.Repeat("a", 40), Fork: true, UpdatedAt: time.Now().UTC()}
	if err := c.preview(ctx, app, spec, event, false); err != nil {
		t.Fatal(err)
	}
	var id string
	_ = c.Store.Pool.QueryRow(ctx, "SELECT id FROM resources WHERE data->>'previewOf'=$1", app.ID).Scan(&id)
	var n int
	_ = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind IN ('deploy','domain')").Scan(&n)
	if n != 0 {
		t.Fatal("unapproved fork produced deployment or DNS work")
	}
	updated := event
	updated.HeadSHA = strings.Repeat("b", 40)
	updated.Action = "synchronize"
	updated.UpdatedAt = event.UpdatedAt.Add(time.Minute)
	if err := c.preview(ctx, app, spec, updated, false); err != nil {
		t.Fatal(err)
	}
	if err := c.ApprovePreview(ctx, id, event.HeadSHA); err == nil {
		t.Fatal("stale fork commit approved")
	}
	if err := c.ApprovePreview(ctx, id, updated.HeadSHA); err != nil {
		t.Fatal(err)
	}
	if err := c.preview(ctx, app, spec, event, false); err != nil {
		t.Fatal(err)
	}
	current, _ := c.Store.Resource(ctx, id)
	preview, _ := model.Decode[model.App](current)
	if preview.PreviewSHA != updated.HeadSHA || preview.ApprovedSHA != updated.HeadSHA {
		t.Fatal("stale delivery reset preview approval")
	}
	closed := updated
	closed.Action = "closed"
	closed.UpdatedAt = updated.UpdatedAt.Add(time.Minute)
	if err := c.preview(ctx, app, spec, closed, false); err != nil {
		t.Fatal(err)
	}
	if err := c.preview(ctx, app, spec, updated, false); err != nil {
		t.Fatal(err)
	}
	current, _ = c.Store.Resource(ctx, id)
	preview, _ = model.Decode[model.App](current)
	if !preview.PreviewClosed {
		t.Fatal("stale event reopened a closed preview")
	}
	// Model an in-flight cleanup worker owning the application. Reopening must
	// leave its state untouched until that worker has finished remote cleanup.
	cleanupUnlock, err := c.lock(ctx, "application:"+id)
	if err != nil {
		t.Fatal(err)
	}
	reopened := closed
	reopened.Action = "reopened"
	reopened.UpdatedAt = closed.UpdatedAt.Add(time.Minute)
	blocked, cancel := context.WithTimeout(ctx, time.Second)
	err = c.preview(blocked, app, spec, reopened, false)
	cancel()
	cleanupUnlock()
	if err == nil {
		t.Fatal("preview reopened during cleanup")
	}
	current, _ = c.Store.Resource(ctx, id)
	preview, _ = model.Decode[model.App](current)
	if !preview.PreviewClosed {
		t.Fatal("cleanup state was overwritten")
	}
	if err = c.preview(ctx, app, spec, reopened, false); err != nil {
		t.Fatal(err)
	}
	current, _ = c.Store.Resource(ctx, id)
	preview, _ = model.Decode[model.App](current)
	if preview.PreviewClosed {
		t.Fatal("preview did not reopen after cleanup")
	}
}

type fakeDNS struct {
	records []model.DNSRecord
	deleted []string
}

func (d *fakeDNS) Zones(context.Context) ([]providers.ProviderZone, error)    { return nil, nil }
func (d *fakeDNS) Records(context.Context, string) ([]model.DNSRecord, error) { return d.records, nil }
func (d *fakeDNS) Put(_ context.Context, _ string, r model.DNSRecord) (model.DNSRecord, error) {
	r.ID = uuid.NewString()
	d.records = append(d.records, r)
	return r, nil
}
func (d *fakeDNS) Delete(_ context.Context, _ string, id string) error {
	d.deleted = append(d.deleted, id)
	return nil
}

type failedIssuer struct{}

type scopedIssuer struct {
	calls int
	ca    string
}

func (i *scopedIssuer) DirectoryURL() string { return i.ca }
func (i *scopedIssuer) Obtain(context.Context, string, string, string) ([]byte, time.Time, error) {
	i.calls++
	return []byte("new-certificate"), time.Now().Add(90 * 24 * time.Hour), nil
}

func TestChangingACMEAuthorityReplacesLongLivedStagingCertificate(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	dns := resource(t, c, "dns", "", "", model.DNS{Provider: "cloudflare"}, nil)
	zone := resource(t, c, "zone", dns.ID, "", model.Zone{Domain: "example.com", ProviderZoneID: "zone"}, nil)
	server := resource(t, c, "server", "", "", model.Server{IPv4: "192.0.2.1"}, nil)
	app := resource(t, c, "application", "", "", model.App{ServerID: server.ID}, nil)
	route := resource(t, c, "route", app.ID, "", model.Route{Protocol: "https", Domain: "app.example.com", TLS: "terminate", ZoneID: zone.ID, TargetPort: 8080}, nil)
	old, _ := c.Store.Vault.Seal([]byte("staging-certificate"), "certificate:"+route.ID)
	_, err := c.Store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,zone_id,domain,certificate_domain,certificate,expires_at,certificate_ca,certificate_state) VALUES($1,$2,'app.example.com','app.example.com',$3,now()+interval '60 days','https://staging.invalid','ready')", route.ID, zone.ID, old)
	if err != nil {
		t.Fatal(err)
	}
	c.DNSFactory = func(string, string) providers.DNSProvider {
		return &fakeDNS{records: []model.DNSRecord{{ID: "a-record", Type: "A", Name: "app.example.com", Content: "192.0.2.1", TTL: 120}}}
	}
	issuer := &scopedIssuer{ca: "https://production.invalid"}
	c.Issuer = issuer
	// No real SSH host is configured; only the DNS/certificate phase is tested.
	_ = c.domain(ctx, route.ID, "adopt")
	var ca string
	var encrypted []byte
	if err = c.Store.Pool.QueryRow(ctx, "SELECT certificate_ca,certificate FROM domain_state WHERE route_id=$1", route.ID).Scan(&ca, &encrypted); err != nil {
		t.Fatal(err)
	}
	plain, err := c.Store.Vault.Open(encrypted, "certificate:"+route.ID)
	if err != nil || ca != issuer.ca || issuer.calls != 1 || string(plain) != "new-certificate" {
		t.Fatal("staging certificate was reused after the authority changed", ca, issuer.calls, err)
	}
}

func (failedIssuer) Obtain(context.Context, string, string, string) ([]byte, time.Time, error) {
	return nil, time.Time{}, errors.New("ACME unavailable")
}
func TestDNSConflictAndRenewalPreservesCertificate(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	team := uuid.NewString()
	dns := resource(t, c, "dns", "", "", model.DNS{Provider: "cloudflare"}, map[string]string{"token": "private"})
	zone := resource(t, c, "zone", dns.ID, "", model.Zone{Domain: "example.com", ProviderZoneID: "zone"}, nil)
	server := resource(t, c, "server", "", "", model.Server{IPv4: "192.0.2.1"}, nil)
	app := resource(t, c, "application", "", team, model.App{ServerID: server.ID}, nil)
	route := resource(t, c, "route", app.ID, team, model.Route{Protocol: "https", Domain: "app.example.com", TLS: "terminate", ZoneID: zone.ID, TargetPort: 8080}, nil)
	provider := &fakeDNS{records: []model.DNSRecord{{ID: "existing", Type: "A", Name: "app.example.com", Content: "192.0.2.1", TTL: 120}}}
	c.DNSFactory = func(string, string) providers.DNSProvider { return provider }
	c.Issuer = failedIssuer{}
	if e := c.domain(ctx, route.ID, ""); e == nil {
		t.Fatal("existing DNS record silently adopted")
	}
	certificate, _ := c.Store.Vault.Seal([]byte("old-certificate"), "certificate:"+route.ID)
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET certificate=$2,expires_at=now()+interval '1 day' WHERE route_id=$1", route.ID, certificate)
	if e := c.domain(ctx, route.ID, "adopt"); e == nil {
		t.Fatal("ACME failure swallowed")
	}
	var encrypted []byte
	var state string
	_ = c.Store.Pool.QueryRow(ctx, "SELECT certificate,certificate_state FROM domain_state WHERE route_id=$1", route.ID).Scan(&encrypted, &state)
	plain, e := c.Store.Vault.Open(encrypted, "certificate:"+route.ID)
	if e != nil || string(plain) != "old-certificate" || state != "renewal_failed" {
		t.Fatal("valid certificate lost", state, e)
	}
	if len(provider.deleted) != 0 {
		t.Fatal("adoption deleted external record")
	}
	if e = c.DeleteDomain(ctx, route.ID); e != nil {
		t.Fatal(e)
	}
	if len(provider.deleted) != 0 {
		t.Fatal("adopted external record deleted")
	}
}
func TestRedactorAcrossWrites(t *testing.T) {
	lines := []string{}
	w := redactor{values: []string{"sensitive-token"}, write: func(s string) { lines = append(lines, s) }}
	_, _ = w.Write([]byte("sensitive-"))
	_, _ = w.Write([]byte("token\nnext"))
	w.Flush()
	if len(lines) != 2 || lines[0] != "[redacted]" || lines[1] != "next" {
		t.Fatal(lines)
	}
}
