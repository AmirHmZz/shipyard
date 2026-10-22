package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/proxy"
)

type DomainState struct {
	RouteID     string        `json:"routeId"`
	Domain      string        `json:"domain"`
	DNS         string        `json:"dns"`
	Propagation string        `json:"propagation"`
	Certificate string        `json:"certificate"`
	Routing     string        `json:"routing"`
	Error       string        `json:"error"`
	ExpiresAt   *time.Time    `json:"expiresAt"`
	Records     []ownedRecord `json:"records"`
}
type ownedRecord struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Name    string `json:"name"`
	Content string `json:"content"`
	Owned   bool   `json:"owned"`
}

func (c *Controller) certificateAuthority() string {
	if issuer, ok := c.Issuer.(interface{ DirectoryURL() string }); ok {
		return issuer.DirectoryURL()
	}
	return ""
}

func (c *Controller) DNS(ctx context.Context, zoneID string) (providers.DNSProvider, model.Zone, model.DNS, error) {
	zone, e := c.Store.Resource(ctx, zoneID)
	if e != nil {
		return nil, model.Zone{}, model.DNS{}, e
	}
	z, e := model.Decode[model.Zone](zone)
	if e != nil {
		return nil, z, model.DNS{}, e
	}
	r, e := c.Store.Resource(ctx, zone.ParentID)
	if e != nil {
		return nil, z, model.DNS{}, e
	}
	d, e := model.Decode[model.DNS](r)
	if e != nil {
		return nil, z, d, e
	}
	secrets, e := c.Store.Secrets(r)
	if e != nil {
		return nil, z, d, e
	}
	var provider providers.DNSProvider = providers.NewDNS(d.Provider, secrets["token"])
	if c.DNSFactory != nil {
		provider = c.DNSFactory(d.Provider, secrets["token"])
	}
	return provider, z, d, nil
}
func (c *Controller) domain(ctx context.Context, id, mode string) (result error) {
	rr, e := c.Store.Resource(ctx, id)
	if e != nil {
		return e
	}
	if rr.ParentID == DashboardID {
		s, e := c.dashboardSettings(ctx)
		if e != nil {
			return e
		}
		if s.RouteID != id {
			return c.renewDashboard(ctx, id)
		}
		return c.dashboardJob(ctx, "dashboard-apply", func() []byte { raw, _ := json.Marshal(map[string]int{"version": s.Version}); return raw }())
	}
	route, e := model.Decode[model.Route](rr)
	if e != nil {
		return e
	}
	if route.ZoneID == "" {
		app, e := c.Store.Resource(ctx, rr.ParentID)
		if e != nil {
			return e
		}
		spec, e := model.Decode[model.App](app)
		if e != nil {
			return e
		}
		return c.syncProxy(ctx, spec.ServerID, nil)
	}
	app, e := c.Store.Resource(ctx, rr.ParentID)
	if e != nil {
		return e
	}
	spec, e := model.Decode[model.App](app)
	if e != nil {
		return e
	}
	server, e := c.Store.Resource(ctx, spec.ServerID)
	if e != nil {
		return e
	}
	host, e := model.Decode[model.Server](server)
	if e != nil {
		return e
	}
	provider, zone, providerSpec, e := c.DNS(ctx, route.ZoneID)
	if e != nil {
		return e
	}
	name, e := model.Domain(route.Domain)
	if e != nil {
		return e
	}
	if name != zone.Domain && !strings.HasSuffix(name, "."+zone.Domain) {
		return errors.New("domain does not belong to the selected zone")
	}
	certificateName := name
	if spec.PreviewOf != "" && spec.PreviewDomain != "" && strings.HasSuffix(name, "."+strings.TrimPrefix(spec.PreviewDomain, "*.")) {
		certificateName = spec.PreviewDomain
	}
	unlock, e := c.lock(ctx, "dns:"+route.ZoneID+":"+name)
	if e != nil {
		return e
	}
	defer unlock()
	_, e = c.Store.Pool.Exec(ctx, `INSERT INTO domain_state(route_id,zone_id,domain) VALUES($1,$2,$3) ON CONFLICT(route_id) DO NOTHING`, id, route.ZoneID, name)
	if e != nil {
		return e
	}
	_, e = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET certificate_domain=$2 WHERE route_id=$1", id, certificateName)
	if e != nil {
		return e
	}
	phase := "dns"
	defer func() {
		if result != nil {
			_, _ = c.Store.Pool.Exec(context.WithoutCancel(ctx), "UPDATE domain_state SET last_error=$2,updated_at=now() WHERE route_id=$1", id, result.Error())
			_ = c.Emit(context.WithoutCancel(ctx), phase+".failed", app.TeamID, rr.ID, map[string]string{"error": result.Error()})
		}
	}()
	var stored []byte
	if e = c.Store.Pool.QueryRow(ctx, "SELECT records FROM domain_state WHERE route_id=$1", id).Scan(&stored); e != nil {
		return e
	}
	owned := []ownedRecord{}
	_ = json.Unmarshal(stored, &owned)
	records, e := provider.Records(ctx, zone.ProviderZoneID)
	if e != nil {
		return e
	}
	matches := providers.Matching(records, name)
	expected := map[string]string{}
	if host.IPv4 != "" {
		expected["A"] = host.IPv4
	}
	if host.IPv6 != "" {
		expected["AAAA"] = host.IPv6
	}
	if len(expected) == 0 {
		return errors.New("configure the deployment server's public IPv4 or IPv6 address")
	}
	tracked := map[string]ownedRecord{}
	for _, r := range owned {
		tracked[r.ID] = r
	}
	// Other paths for the same hostname may share records created by Shipyard.
	rows, e := c.Store.Pool.Query(ctx, "SELECT records FROM domain_state WHERE domain=$1 AND zone_id=$2 AND route_id<>$3", name, route.ZoneID, id)
	if e != nil {
		return e
	}
	for rows.Next() {
		var raw []byte
		if rows.Scan(&raw) == nil {
			var shared []ownedRecord
			_ = json.Unmarshal(raw, &shared)
			for _, r := range shared {
				tracked[r.ID] = r
			}
		}
	}
	rows.Close()
	for _, record := range matches {
		if record.Type != "A" && record.Type != "AAAA" && record.Type != "CNAME" {
			continue
		}
		previous, known := tracked[record.ID]
		wanted := expected[record.Type]
		if known && wanted == record.Content && !record.Proxied {
			_ = previous
			continue
		}
		if mode == "adopt" && wanted == record.Content && !record.Proxied {
			tracked[record.ID] = ownedRecord{record.ID, record.Type, record.Name, record.Content, false}
			continue
		}
		if mode != "replace" {
			_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET dns_state='conflict' WHERE route_id=$1", id)
			return errors.New("DNS record conflict: explicitly adopt matching records or replace conflicting address/CNAME records")
		}
		if e = provider.Delete(ctx, zone.ProviderZoneID, record.ID); e != nil {
			return e
		}
		delete(tracked, record.ID)
	}
	owned = nil
	for kind, content := range expected {
		found := false
		for _, record := range matches {
			if record.Type == kind && record.Content == content {
				if previous, ok := tracked[record.ID]; ok {
					owned = append(owned, previous)
					found = true
					break
				}
			}
		}
		if !found {
			record, e := provider.Put(ctx, zone.ProviderZoneID, model.DNSRecord{Type: kind, Name: name, Content: content, TTL: 120})
			if e != nil {
				return e
			}
			owned = append(owned, ownedRecord{record.ID, kind, name, content, true})
		}
		raw, _ := json.Marshal(owned)
		if _, e = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET records=$2 WHERE route_id=$1", id, raw); e != nil {
			return e
		}
	}
	_, e = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET dns_state='ready',last_error='',updated_at=now() WHERE route_id=$1", id)
	if e != nil {
		return e
	}
	probe := name
	if strings.HasPrefix(probe, "*.") {
		probe = "shipyard-probe." + strings.TrimPrefix(probe, "*.")
	}
	ips, lookupErr := net.DefaultResolver.LookupHost(ctx, probe)
	propagation := "pending"
	if lookupErr == nil {
		for _, ip := range ips {
			for _, wanted := range expected {
				if net.ParseIP(ip).Equal(net.ParseIP(wanted)) {
					propagation = "ready"
				}
			}
		}
	}
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET propagation_state=$2 WHERE route_id=$1", id, propagation)
	if route.TLS == "terminate" {
		phase = "certificate"
		unlockCertificate, e := c.lock(ctx, "certificate:"+route.ZoneID+":"+certificateName)
		if e != nil {
			return e
		}
		defer unlockCertificate()
		var certificate []byte
		var expires *time.Time
		var previousState string
		var previousCA string
		ca := c.certificateAuthority()
		if e = c.Store.Pool.QueryRow(ctx, "SELECT certificate,expires_at,certificate_state,certificate_ca FROM domain_state WHERE route_id=$1", id).Scan(&certificate, &expires, &previousState, &previousCA); e != nil {
			return e
		}
		if len(certificate) == 0 || expires == nil || expires.Before(time.Now().Add(30*24*time.Hour)) || previousCA != ca {
			var sharedID string
			var shared []byte
			var until time.Time
			sharedErr := c.Store.Pool.QueryRow(ctx, "SELECT route_id,certificate,expires_at FROM domain_state WHERE certificate_domain=$1 AND zone_id=$2 AND certificate_ca=$3 AND expires_at>now()+interval '30 days' AND certificate IS NOT NULL LIMIT 1", certificateName, route.ZoneID, ca).Scan(&sharedID, &shared, &until)
			var pemBytes []byte
			if sharedErr == nil {
				pemBytes, e = c.Store.Vault.Open(shared, "certificate:"+sharedID)
			} else {
				_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET certificate_state='issuing' WHERE route_id=$1", id)
				dnsResource, _ := c.Store.Resource(ctx, (func() string { z, _ := c.Store.Resource(ctx, route.ZoneID); return z.ParentID })())
				secrets, se := c.Store.Secrets(dnsResource)
				if se != nil {
					return se
				}
				pemBytes, until, e = c.Issuer.Obtain(ctx, certificateName, providerSpec.Provider, secrets["token"])
			}
			if e != nil {
				_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET certificate_state=CASE WHEN certificate IS NULL THEN 'failed' ELSE 'renewal_failed' END WHERE route_id=$1", id)
				return e
			}
			sealed, e := c.Store.Vault.Seal(pemBytes, "certificate:"+id)
			if e != nil {
				return e
			}
			if previousState == "failed" || previousState == "renewal_failed" {
				_ = c.Emit(ctx, "certificate.recovered", app.TeamID, id, map[string]any{"expiresAt": until})
			}
			_, e = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET certificate=$2,expires_at=$3,certificate_ca=$4,certificate_state='ready',last_error='' WHERE route_id=$1", id, sealed, until, ca)
			if e != nil {
				return e
			}
		}
	} else {
		_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET certificate_state='off' WHERE route_id=$1", id)
	}
	phase = "routing"
	return c.syncProxy(ctx, spec.ServerID, nil)
}
func (c *Controller) DomainState(ctx context.Context, id string) (DomainState, error) {
	var d DomainState
	var b []byte
	e := c.Store.Pool.QueryRow(ctx, "SELECT route_id,domain,dns_state,propagation_state,certificate_state,routing_state,last_error,expires_at,records FROM domain_state WHERE route_id=$1", id).Scan(&d.RouteID, &d.Domain, &d.DNS, &d.Propagation, &d.Certificate, &d.Routing, &d.Error, &d.ExpiresAt, &b)
	if e == nil {
		e = json.Unmarshal(b, &d.Records)
	}
	return d, e
}
func (c *Controller) DeleteDomain(ctx context.Context, id string) error {
	state, e := c.DomainState(ctx, id)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil
	}
	if e != nil {
		return e
	}
	resource, e := c.Store.Resource(ctx, id)
	if e != nil {
		return e
	}
	route, e := model.Decode[model.Route](resource)
	if e != nil {
		return e
	}
	unlock, e := c.lock(ctx, "dns:"+route.ZoneID+":"+route.Domain)
	if e != nil {
		return e
	}
	defer unlock()
	state, e = c.DomainState(ctx, id)
	if e != nil {
		return e
	}
	var zoneID string
	if e = c.Store.Pool.QueryRow(ctx, "SELECT COALESCE(zone_id,'') FROM domain_state WHERE route_id=$1", id).Scan(&zoneID); e != nil {
		return e
	}
	if zoneID == "" {
		_, e = c.Store.Pool.Exec(ctx, "DELETE FROM domain_state WHERE route_id=$1", id)
		return e
	}
	provider, zone, _, e := c.DNS(ctx, zoneID)
	if e != nil {
		return e
	}
	records, e := provider.Records(ctx, zone.ProviderZoneID)
	if e != nil {
		return e
	}
	for _, owned := range state.Records {
		if !owned.Owned {
			continue
		}
		var shared bool
		if e = c.Store.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM domain_state d WHERE route_id<>$1 AND records @> $2::jsonb AND NOT EXISTS(
 SELECT 1 FROM resources other JOIN resources current ON current.id=$1 WHERE other.id=d.route_id AND other.data->>'deleting'='true' AND other.data->>'deletionRoot'=current.data->>'deletionRoot'
))`, id, fmt.Sprintf(`[{"id":%q}]`, owned.ID)).Scan(&shared); e != nil {
			return e
		}
		if shared {
			continue
		}
		for _, record := range records {
			if record.ID == owned.ID {
				if record.Content != owned.Content || record.Name != owned.Name {
					return errors.New("managed DNS record changed externally; refusing to delete it")
				}
				if e = provider.Delete(ctx, zone.ProviderZoneID, owned.ID); e != nil {
					return e
				}
			}
		}
	}
	_, e = c.Store.Pool.Exec(ctx, "DELETE FROM domain_state WHERE route_id=$1", id)
	return e
}
func (c *Controller) syncProxy(ctx context.Context, server string, candidate *model.Release) error {
	unlock, e := c.lock(ctx, "proxy:"+server)
	if e != nil {
		return e
	}
	defer unlock()
	if e = c.mutableResource(ctx, server); e != nil {
		return e
	}
	settings, e := c.proxySettings(ctx, server)
	if e != nil {
		return e
	}
	return c.syncProxyLocked(ctx, server, candidate, settings.Bindings)
}

func (c *Controller) syncProxyLocked(ctx context.Context, server string, candidate *model.Release, overrides proxy.Bindings) error {
	rows, e := c.Store.Pool.Query(ctx, "SELECT a.app_id FROM app_runtime a LEFT JOIN application_control c ON c.app_id=a.app_id WHERE a.status='running' AND COALESCE(c.desired_state,'running')='running'")
	if e != nil {
		return e
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	releases := []model.Release{}
	for _, id := range ids {
		app, err := c.Store.Resource(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && model.IsDeleting(app)) {
			continue
		}
		if err != nil {
			return err
		}
		r, e := c.Store.Active(ctx, id)
		if e != nil {
			return e
		}
		if r.ServerID == server && (candidate == nil || candidate.AppID != r.AppID) {
			releases = append(releases, r)
		}
	}
	if candidate != nil {
		var stopped bool
		if e = c.Store.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM application_control WHERE app_id=$1 AND desired_state='stopped')", candidate.AppID).Scan(&stopped); e != nil {
			return e
		}
		if !stopped {
			releases = append(releases, *candidate)
		}
	}
	bindings := []proxy.Binding{}
	certs := map[string][]byte{}
	ready := []string{}
	for _, release := range releases {
		routes, e := c.Store.Children(ctx, release.AppID, "route")
		if e != nil {
			return e
		}
		for _, rr := range routes {
			route, e := model.Decode[model.Route](rr)
			if e != nil {
				return e
			}
			service := route.Service
			if service == "" {
				service = "app"
			}
			targets := []model.Target{}
			for _, t := range release.Targets {
				if t.Service == service && t.Port == route.TargetPort {
					targets = append(targets, t)
				}
			}
			// A pending port edit must not discard a healthy retained release's
			// routing target during rollback or a background proxy reconciliation.
			if len(targets) == 0 {
				for _, historical := range release.Routes {
					if historical.ID != rr.ID {
						continue
					}
					old, err := model.Decode[model.Route](historical)
					if err != nil {
						return err
					}
					oldService := old.Service
					if oldService == "" {
						oldService = "app"
					}
					for _, t := range release.Targets {
						if t.Service == oldService && t.Port == old.TargetPort {
							targets = append(targets, t)
						}
					}
					if len(targets) > 0 {
						route.TargetPort = old.TargetPort
						route.Service = oldService
					}
				}
			}
			if len(targets) == 0 {
				_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET routing_state='redeploy_required' WHERE route_id=$1", rr.ID)
				continue
			}
			b := proxy.Binding{ID: strings.ReplaceAll(rr.ID, "-", ""), FrontendID: rr.ID, Route: route, Targets: targets}
			if route.TLS == "terminate" {
				var encrypted []byte
				var expires *time.Time
				e = c.Store.Pool.QueryRow(ctx, "SELECT certificate,expires_at FROM domain_state WHERE route_id=$1", rr.ID).Scan(&encrypted, &expires)
				if e != nil || len(encrypted) == 0 || expires == nil || expires.Before(time.Now()) {
					_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET routing_state='waiting_certificate' WHERE route_id=$1", rr.ID)
					continue
				}
				plain, e := c.Store.Vault.Open(encrypted, "certificate:"+rr.ID)
				if e != nil {
					return e
				}
				certs[b.ID] = plain
				b.Certificate = true
			}
			bindings = append(bindings, b)
			ready = append(ready, rr.ID)
		}
	}
	hostResource, e := c.Store.Resource(ctx, server)
	if e != nil {
		return e
	}
	host, e := model.Decode[model.Server](hostResource)
	if e != nil {
		return e
	}
	bindings, bootstrap, e := c.dashboardProxy(ctx, server, bindings, certs)
	if e != nil {
		return e
	}
	if c.Local != nil && server == LocalServerID {
		if e = c.dashboardHealth(ctx); e != nil {
			return e
		}
		s, err := c.dashboardSettings(ctx)
		if err != nil {
			return err
		}
		for _, id := range []string{s.RouteID, s.ActiveRouteID} {
			for _, b := range bindings {
				if b.Certificate && b.ID == strings.ReplaceAll(id, "-", "") {
					ready = append(ready, id)
				}
			}
		}
	}
	config, e := proxy.Render(bindings, proxy.Options{IPv6: host.IPv6 != "", Bindings: overrides, Challenge: bootstrap})
	if e != nil {
		return e
	}
	maps, e := proxy.RoutingMaps(bindings)
	if e != nil {
		return e
	}
	client, _, e := c.connect(ctx, server)
	if e != nil {
		return e
	}
	defer client.Close()
	if e = proxy.Apply(ctx, client, config, certs, io.Discard, maps); e != nil {
		return e
	}
	for _, id := range ready {
		_, _ = c.Store.Pool.Exec(ctx, "UPDATE domain_state SET routing_state='ready',last_error='' WHERE route_id=$1", id)
	}
	return nil
}
