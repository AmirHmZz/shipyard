package control

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"net"
	"net/http"
	"shipyard/internal/certs"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/proxy"
	"shipyard/internal/remote"
	"strings"
	"time"
)

const LocalServerID = "shipyard-local"
const DashboardID = "shipyard-dashboard"
const DashboardNetworkID = "shipyard-dashboard-network"
const dashboardKey = "dashboard-access"

func Protected(id string) bool {
	return id == LocalServerID || id == DashboardID || id == DashboardNetworkID || strings.HasPrefix(id, "shipyard-dashboard-route-")
}
func (c *Controller) LocalClient(ctx context.Context) (remote.Node, model.Resource, error) {
	return c.connect(ctx, LocalServerID)
}

type DashboardSettings struct {
	Version       int    `json:"version"`
	Domain        string `json:"domain"`
	RouteID       string `json:"routeId"`
	ActiveDomain  string `json:"activeDomain"`
	ActiveRouteID string `json:"activeRouteId"`
}
type DashboardState struct {
	DashboardSettings
	Enabled         bool         `json:"enabled"`
	Origin          string       `json:"origin"`
	CandidateOrigin string       `json:"candidateOrigin"`
	Status          *DomainState `json:"status,omitempty"`
	ACMEConfigured  bool         `json:"acmeConfigured"`
	ACMEEmail       string       `json:"acmeEmail"`
	Error           string       `json:"error,omitempty"`
}
type dashboardTarget struct {
	ServerID string `json:"serverId"`
	Address  string `json:"address"`
	Gateway  string `json:"gateway"`
	Port     int    `json:"port"`
}

func (c *Controller) dashboardSettings(ctx context.Context) (DashboardSettings, error) {
	var s DashboardSettings
	var raw []byte
	e := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", dashboardKey).Scan(&raw)
	if errors.Is(e, pgx.ErrNoRows) {
		return s, nil
	}
	if e == nil {
		e = json.Unmarshal(raw, &s)
	}
	return s, e
}
func (c *Controller) Dashboard(ctx context.Context) (DashboardState, error) {
	s, e := c.dashboardSettings(ctx)
	out := DashboardState{DashboardSettings: s, Enabled: c.Local != nil}
	if e != nil {
		return out, e
	}
	if s.ActiveDomain != "" {
		out.Origin = "https://" + s.ActiveDomain
	}
	if s.Domain != "" {
		out.CandidateOrigin = "https://" + s.Domain
	}
	out.ACMEConfigured = c.Issuer != nil
	if a, ok := c.Issuer.(*certs.ACME); ok {
		v, err := a.Configuration(ctx)
		if err != nil {
			return out, err
		}
		out.ACMEConfigured = v.AcceptTOS
		out.ACMEEmail = v.Email
	}
	if s.RouteID != "" {
		v, err := c.DomainState(ctx, s.RouteID)
		if err == nil {
			out.Status = &v
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return out, err
		}
	}
	_ = c.Store.Pool.QueryRow(ctx, "SELECT last_error FROM jobs WHERE resource_id=$1 AND kind='dashboard-apply' ORDER BY created_at DESC LIMIT 1", DashboardID).Scan(&out.Error)
	return out, nil
}
func (c *Controller) QueueDashboard(ctx context.Context, version int, domain, actor string, configuration ...certs.Configuration) (string, error) {
	if c.Local == nil {
		return "", errors.New("native Linux local host mode is required")
	}
	name, e := model.Domain(domain)
	if e != nil || strings.HasPrefix(name, "*.") {
		return "", errors.New("one dashboard hostname is required")
	}
	if len(configuration) > 0 {
		if e = configuration[0].Validate(); e != nil {
			return "", e
		}
	}
	unlock, e := c.lock(ctx, "dashboard-settings")
	if e != nil {
		return "", e
	}
	defer unlock()
	s, e := c.dashboardSettings(ctx)
	if e != nil {
		return "", e
	}
	if s.Version != version {
		return "", db.ErrConflict
	}
	previous := s.RouteID
	if s.Domain != name || s.RouteID == "" {
		s.RouteID = "shipyard-dashboard-route-" + uuid.NewString()
	}
	s.Domain = name
	s.Version++
	tx, e := c.Store.Pool.Begin(ctx)
	if e != nil {
		return "", e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); e != nil {
		return "", e
	}
	var conflict bool
	if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE kind='route' AND parent_id<>$1 AND lower(data->>'domain')=$2)", DashboardID, name).Scan(&conflict); e != nil {
		return "", e
	}
	if conflict {
		return "", errors.New("hostname is already assigned")
	}
	raw, _ := json.Marshal(model.Route{Protocol: "https", TLS: "terminate", Domain: name, Service: "dashboard", TargetPort: 8080})
	if _, e = tx.Exec(ctx, "INSERT INTO resources(id,kind,name,parent_id,data) VALUES($1,'route',NULL,$2,$3) ON CONFLICT(id) DO UPDATE SET data=$3,version=resources.version+1", s.RouteID, DashboardID, raw); e != nil {
		return "", e
	}
	if len(configuration) > 0 {
		raw, _ = json.Marshal(configuration[0])
		if _, e = tx.Exec(ctx, "INSERT INTO settings(key,value) VALUES('acme-config',$1) ON CONFLICT(key) DO UPDATE SET value=$1", raw); e != nil {
			return "", e
		}
	}
	raw, _ = json.Marshal(s)
	if _, e = tx.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", dashboardKey, raw); e != nil {
		return "", e
	}
	id := uuid.NewString()
	payload, _ := json.Marshal(map[string]any{"version": s.Version, "actor": actor})
	if _, e = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'dashboard-apply',$2,$3,$1)", id, DashboardID, payload); e != nil {
		return "", e
	}
	if previous != "" && previous != s.ActiveRouteID && previous != s.RouteID {
		if _, e = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'dashboard-retire',$2,jsonb_build_object('routeId',$3::text),$1)", uuid.NewString(), DashboardID, previous); e != nil {
			return "", e
		}
	}
	return id, tx.Commit(ctx)
}
func (c *Controller) dashboardJob(ctx context.Context, _ string, payload []byte) (result error) {
	var in struct {
		Version int
		Actor   string
	}
	if e := json.Unmarshal(payload, &in); e != nil {
		return e
	}
	defer func() {
		action := "dashboard.applied"
		if result != nil {
			action += ".failed"
		}
		_ = c.Store.Audit(context.WithoutCancel(ctx), in.Actor, action, DashboardID, "", nil)
	}()
	unlock, e := c.lock(ctx, "dashboard-settings")
	if e != nil {
		return e
	}
	defer unlock()
	s, e := c.dashboardSettings(ctx)
	if e != nil || s.Version != in.Version {
		return e
	}
	return c.applyDashboard(ctx, s)
}
func (c *Controller) applyDashboard(ctx context.Context, s DashboardSettings) (result error) {
	return c.applyDashboardRoute(ctx, s, true)
}
func (c *Controller) renewDashboard(ctx context.Context, id string) error {
	unlock, e := c.lock(ctx, "dashboard-settings")
	if e != nil {
		return e
	}
	defer unlock()
	s, e := c.dashboardSettings(ctx)
	if e != nil {
		return e
	}
	if id != s.ActiveRouteID {
		return nil
	}
	s.Domain = s.ActiveDomain
	s.RouteID = id
	return c.applyDashboardRoute(ctx, s, false)
}
func (c *Controller) applyDashboardRoute(ctx context.Context, s DashboardSettings, activate bool) (result error) {
	_, e := c.Store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,domain,dns_state) VALUES($1,$2,'manual') ON CONFLICT(route_id) DO NOTHING", s.RouteID, s.Domain)
	if e != nil {
		return e
	}
	defer func() {
		if result != nil {
			_, _ = c.Store.Pool.Exec(context.WithoutCancel(ctx), "UPDATE domain_state SET last_error=$2,updated_at=now() WHERE route_id=$1", s.RouteID, result.Error())
		}
	}()
	host, e := c.Store.Resource(ctx, LocalServerID)
	if e != nil {
		return e
	}
	server, _ := model.Decode[model.Server](host)
	prop := "ready"
	var dnsError error
	if c.DashboardDNSCheck != nil {
		dnsError = c.DashboardDNSCheck(ctx, s.Domain, server)
		if dnsError != nil {
			prop = "mismatch"
		}
	} else {
		ips, err := net.DefaultResolver.LookupHost(ctx, s.Domain)
		if err != nil || len(ips) == 0 {
			prop = "pending"
			dnsError = fmt.Errorf("dashboard DNS has not propagated: %v", err)
		}
		for _, ip := range ips {
			if !net.ParseIP(ip).Equal(net.ParseIP(server.IPv4)) && !net.ParseIP(ip).Equal(net.ParseIP(server.IPv6)) {
				prop = "mismatch"
				dnsError = fmt.Errorf("dashboard DNS resolves to %s; expected configured IPv4 %q or IPv6 %q", strings.Join(ips, ", "), server.IPv4, server.IPv6)
			}
		}
	}
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET propagation_state=$2 WHERE route_id=$1", s.RouteID, prop)
	if prop != "ready" {
		return fmt.Errorf("%v; point all dashboard A/AAAA records directly to this server, then retry", dnsError)
	}
	if e = c.syncProxy(ctx, LocalServerID, nil); e != nil {
		return e
	}
	var encrypted []byte
	var until *time.Time
	var ca string
	e = c.Store.Pool.QueryRow(ctx, "SELECT certificate,expires_at,certificate_ca FROM domain_state WHERE route_id=$1", s.RouteID).Scan(&encrypted, &until, &ca)
	if e != nil {
		return e
	}
	if len(encrypted) == 0 || until == nil || until.Before(time.Now().Add(30*24*time.Hour)) || ca != c.certificateAuthority() {
		issuer, ok := c.Issuer.(interface {
			ObtainHTTP(context.Context, string) ([]byte, time.Time, error)
		})
		if !ok {
			return errors.New("HTTP-01 certificate issuer is unavailable")
		}
		bundle, expires, err := issuer.ObtainHTTP(ctx, s.Domain)
		if err != nil {
			state := "failed"
			if len(encrypted) > 0 && until != nil && until.After(time.Now()) {
				state = "renewal_failed"
			}
			_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET certificate_state=$2 WHERE route_id=$1", s.RouteID, state)
			return err
		}
		encrypted, e = c.Store.Vault.Seal(bundle, "certificate:"+s.RouteID)
		if e != nil {
			return e
		}
		_, e = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET certificate=$2,expires_at=$3,certificate_domain=domain,certificate_ca=$4,certificate_state='ready' WHERE route_id=$1", s.RouteID, encrypted, expires, c.certificateAuthority())
		if e != nil {
			return e
		}
	}
	if e = c.syncProxy(ctx, LocalServerID, nil); e != nil {
		return e
	}
	origin := "https://" + s.Domain
	if c.DashboardVerify != nil {
		e = c.DashboardVerify(ctx, origin)
	} else {
		e = c.verifyDashboardHTTPS(ctx, s.Domain)
	}
	if e != nil {
		return e
	}
	if !activate {
		return nil
	}
	previous := s.ActiveRouteID
	s.ActiveDomain = s.Domain
	s.ActiveRouteID = s.RouteID
	raw, _ := json.Marshal(s)
	tx, e := c.Store.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "UPDATE settings SET value=$2 WHERE key=$1", dashboardKey, raw); e != nil {
		return e
	}
	if previous != "" && previous != s.RouteID {
		if _, e = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'dashboard-retire',$2,jsonb_build_object('routeId',$3::text),$1)", uuid.NewString(), DashboardID, previous); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}
func (c *Controller) verifyDashboardHTTPS(ctx context.Context, domain string) error {
	settings, e := c.proxySettings(ctx, LocalServerID)
	if e != nil {
		return e
	}
	tr := &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}, DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		var last error
		for _, address := range proxy.HTTPSProbeAddresses(settings.Bindings) {
			conn, e := c.Local.DialContext(ctx, "tcp", address)
			if e == nil {
				return conn, nil
			}
			last = e
		}
		return nil, last
	}}
	defer tr.CloseIdleConnections()
	client := &http.Client{Transport: tr, Timeout: 15 * time.Second}
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://"+domain+"/healthz", nil)
	res, e := client.Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("HTTPS verification returned %d", res.StatusCode)
	}
	return nil
}
func (c *Controller) retireDashboardRoute(ctx context.Context, payload []byte) error {
	var in struct{ RouteID string }
	if e := json.Unmarshal(payload, &in); e != nil {
		return e
	}
	s, e := c.dashboardSettings(ctx)
	if e != nil {
		return e
	}
	if in.RouteID == s.RouteID || in.RouteID == s.ActiveRouteID || !strings.HasPrefix(in.RouteID, "shipyard-dashboard-route-") {
		return nil
	}
	if e = c.DeleteDomain(ctx, in.RouteID); e != nil {
		return e
	}
	_, e = c.Store.Pool.Exec(ctx, "DELETE FROM resources WHERE id=$1 AND parent_id=$2", in.RouteID, DashboardID)
	return e
}
func (c *Controller) dashboardProxy(ctx context.Context, server string, bindings []proxy.Binding, bundles map[string][]byte) ([]proxy.Binding, *proxy.Challenge, error) {
	if c.Local == nil || server != LocalServerID {
		return bindings, nil, nil
	}
	s, e := c.dashboardSettings(ctx)
	if e != nil {
		return nil, nil, e
	}
	owner, e := c.Store.Resource(ctx, DashboardID)
	if e != nil {
		return nil, nil, e
	}
	target, _ := model.Decode[dashboardTarget](owner)
	challenge := &proxy.Challenge{Domains: []string{}, Target: model.Target{Address: target.Address, Port: target.Port}}
	seen := map[string]bool{}
	for _, id := range []string{s.RouteID, s.ActiveRouteID} {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		r, e := c.Store.Resource(ctx, id)
		if e != nil {
			return nil, nil, e
		}
		route, _ := model.Decode[model.Route](r)
		challenge.Domains = append(challenge.Domains, route.Domain)
		b := proxy.Binding{ID: strings.ReplaceAll(id, "-", ""), Route: route, Targets: []model.Target{challenge.Target}, Unavailable: true}
		var encrypted []byte
		var until *time.Time
		if c.Store.Pool.QueryRow(ctx, "SELECT certificate,expires_at FROM domain_state WHERE route_id=$1", id).Scan(&encrypted, &until) == nil && len(encrypted) > 0 && until != nil && until.After(time.Now()) {
			plain, err := c.Store.Vault.Open(encrypted, "certificate:"+id)
			if err != nil {
				return nil, nil, err
			}
			bundles[b.ID] = plain
			b.Certificate = true
			b.Unavailable = false
		}
		bindings = append(bindings, b)
	}
	return bindings, challenge, nil
}
