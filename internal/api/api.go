package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	contract "shipyard/api"
	"shipyard/internal/backup"
	"shipyard/internal/buildinfo"
	"shipyard/internal/control"
	"shipyard/internal/db"
	"shipyard/internal/db/query"
	"shipyard/internal/gitauth"
	"shipyard/internal/model"
	"shipyard/internal/platformupdate"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
	"shipyard/internal/telemetry"
	webassets "shipyard/internal/web"
)

type API struct {
	Updates        *platformupdate.Service
	Store          *db.Store
	Control        *control.Controller
	Origin         string
	BootstrapToken string
	DatabaseURL    string
	Logger         *slog.Logger
	Telemetry      telemetry.Config
	GitAuth        *gitauth.Service
	limits         limiter
}

func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, msg string) {
	respond(w, status, map[string]string{"error": msg})
}
func decode(w http.ResponseWriter, r *http.Request, out any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if e := decoder.Decode(out); e != nil {
		fail(w, 400, "Invalid request: "+e.Error())
		return false
	}
	if e := decoder.Decode(new(any)); e != io.EOF {
		fail(w, 400, "Request must contain one JSON value")
		return false
	}
	return true
}
func (a *API) err(w http.ResponseWriter, e error) {
	if errors.Is(e, db.ErrConflict) {
		fail(w, 409, e.Error())
		return
	}
	if errors.Is(e, db.ErrDeleting) {
		fail(w, 409, e.Error())
		return
	}
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Resource not found or changed; refresh and try again")
		return
	}
	a.Logger.Error("API request failed", "error", e)
	fail(w, 500, "Operation failed; check the server log")
}
func (a *API) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Recoverer, sentryhttp.New(sentryhttp.Options{Repanic: true}).Handle, a.headers)
	r.Get("/api/v1/version", func(w http.ResponseWriter, r *http.Request) { respond(w, 200, buildinfo.Current()) })
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if a.Store.Ping(ctx) != nil {
			fail(w, 503, "Database unavailable")
			return
		}
		respond(w, 200, map[string]string{"status": "ok"})
	})
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/telemetry", func(w http.ResponseWriter, r *http.Request) { respond(w, 200, a.Telemetry) })
		r.Get("/openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/yaml")
			_, _ = w.Write(contract.OpenAPI)
		})
		r.Get("/auth/status", a.status)
		r.Post("/auth/setup", a.setup)
		r.Post("/auth/login", a.login)
		r.Post("/auth/accept", a.accept)
		r.Post("/hooks/{id}", a.hook)
		r.Group(func(r chi.Router) {
			r.Use(a.require)
			r.Post("/git/setup/start", a.gitSetupStart)
			r.Get("/git/setup/config", func(w http.ResponseWriter, r *http.Request) {
				if !a.admin(w, r) {
					return
				}
				origin := a.canonicalOrigin(r.Context())
				respond(w, 200, map[string]string{"origin": origin, "giteaCallback": origin + "/api/v1/git/setup/gitea/callback"})
			})
			r.Get("/git/gitea/instances", a.gitInstances)
			r.Put("/git/gitea/instances", a.gitInstances)
			r.Get("/git/setup/github/install", a.githubInstall)
			r.Get("/git/setup/{provider}/callback", a.gitCallback)
			r.Get("/git/{id}/setup", a.gitSetupStatus)
			r.Post("/git/{id}/reconnect", a.gitReconnect)
			r.Post("/git/{id}/webhook-secret", a.gitSigningSecret)
			r.Get("/auth/me", a.me)
			r.Post("/auth/logout", a.logout)
			r.Post("/auth/password", a.changePassword)
			r.Get("/users", a.users)
			r.Put("/users/{id}", a.updateUser)
			r.Post("/auth/totp/start", a.totpStart)
			r.Post("/auth/totp/confirm", a.totpConfirm)
			r.Post("/auth/totp/disable", a.totpDisable)
			r.Get("/resources", a.resources)
			r.Post("/resources", a.saveResource)
			r.Get("/resources/{id}", a.resource)
			r.Put("/resources/{id}", a.saveResource)
			r.Delete("/resources/{id}", a.deleteResource)
			r.Post("/resources/{id}/grants", a.grant)
			r.Get("/resources/{id}/grants", a.grants)
			r.Post("/servers/fingerprint", a.fingerprint)
			r.Post("/servers/{id}/provision", a.provision)
			r.Post("/servers/{id}/test", a.testServer)
			r.Post("/servers/{id}/deletion-plan", a.serverDeletionPlan)
			r.Delete("/servers/{id}", a.serverDeletionExecute)
			r.Get("/servers/{id}/deletion", a.serverDeletionStatus)
			r.Post("/servers/{id}/deletion/retry", a.serverDeletionRetry)
			r.Put("/servers/{id}/deletion/connection", a.serverDeletionConnection)
			r.Get("/servers/{id}/haproxy", a.haproxySettings)
			r.Put("/servers/{id}/haproxy", a.haproxySettings)
			r.Get("/servers/{id}/metrics", a.metrics)
			r.Get("/git/{id}/repositories", a.repositories)
			r.Get("/git/{id}/branches", a.branches)
			r.Get("/dns/{id}/zones", a.providerZones)
			r.Get("/zones/{id}/records", a.records)
			r.Get("/zones/{id}/certificates", a.zoneCertificates)
			r.Post("/zones/{id}/records", a.putRecord)
			r.Put("/zones/{id}/records/{record}", a.putRecord)
			r.Delete("/zones/{id}/records/{record}", a.deleteRecord)
			r.Get("/routes/{id}/status", a.domainStatus)
			r.Post("/routes/{id}/sync", a.syncDomain)
			r.Get("/applications/{id}/runtime", a.runtime)
			r.Get("/applications/{id}/services", a.applicationServices)
			r.Get("/applications/{id}/networking", a.networking)
			r.Put("/applications/{id}/networking", a.networking)
			r.Get("/applications/{id}/published-ports", a.publishedPorts)
			r.Put("/applications/{id}/published-ports", a.publishedPorts)
			r.Get("/servers/{id}/networks", a.networks)
			r.Post("/servers/{id}/networks", a.networks)
			r.Get("/applications/{id}/compose", a.composeSource)
			r.Put("/applications/{id}/compose", a.composeSource)
			r.Get("/applications/{id}/metrics", a.metrics)
			r.Post("/applications/{id}/deploy", a.deploy)
			r.Post("/applications/{id}/rollback", a.rollback)
			r.Post("/applications/{id}/action", a.action)
			r.Post("/applications/{id}/approve-preview", a.approvePreview)
			r.Get("/applications/{id}/releases", a.releases)
			r.Get("/applications/{id}/logs", a.logs)
			r.Get("/applications/{id}/terminal", a.terminal)
			r.Get("/deployments", a.deployments)
			r.Get("/deployments/{id}", a.deployment)
			r.Get("/deployments/{id}/events", a.events)
			r.Get("/teams/{id}/members", a.members)
			r.Post("/teams/{id}/invitations", a.invite)
			r.Post("/projects/{id}/members", a.projectMember)
			r.Delete("/teams/{id}/members/{user}", a.removeMember)
			r.Get("/audit", a.audit)
			r.Get("/jobs", a.jobs)
			r.Post("/settings/maintenance", a.maintenance)
			r.Get("/settings/updates", a.updates)
			r.Post("/settings/updates/check", a.checkUpdates)
			r.Post("/settings/updates/plan", a.planUpdate)
			r.Post("/settings/updates", a.executeUpdate)
			r.Get("/settings/updates/{id}", a.updateOperation)
			r.Get("/settings/updates/{id}/backup", a.updateBackup)
			r.Get("/settings/alerts", a.alertSettings)
			r.Get("/settings/dashboard-access", a.dashboardAccess)
			r.Put("/settings/dashboard-access", a.dashboardAccess)
			r.Post("/settings/dashboard-access/retry", a.retryDashboard)
			r.Put("/settings/alerts", a.alertSettings)
			r.Post("/backup", a.export)
		})
	})
	assets, _ := fs.Sub(webassets.Assets, "dist")
	files := http.FileServer(http.FS(assets))
	r.Get("/.well-known/acme-challenge/{token}", a.httpChallenge)
	r.Handle("/.well-known/acme-challenge/*", http.NotFoundHandler())
	r.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			fail(w, 404, "Endpoint not found")
			return
		}
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name != "" {
			if f, e := assets.Open(name); e == nil {
				f.Close()
				if strings.HasPrefix(name, "assets/") {
					w.Header().Set("Cache-Control", "public,max-age=31536000,immutable")
				}
				files.ServeHTTP(w, r)
				return
			}
		}
		b, e := fs.ReadFile(assets, "index.html")
		if e != nil {
			http.Error(w, "Dashboard is not built", 503)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(b)
	}))
	return r
}
func (a *API) headers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		connect := "'self'"
		if origin := a.Telemetry.ConnectOrigin(); origin != "" {
			connect += " " + origin
		}
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src "+connect+"; frame-ancestors 'none'; base-uri 'self'")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		if r.Method != "GET" && r.Method != "HEAD" && strings.HasPrefix(r.URL.Path, "/api/") && !strings.HasPrefix(r.URL.Path, "/api/v1/hooks/") {
			if origin := r.Header.Get("Origin"); origin != "" && !a.allowedOrigin(r, origin) {
				fail(w, 403, "Origin is not allowed")
				return
			}
			if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
				fail(w, 415, "Use application/json")
				return
			}
			if a.Store.Maintenance(r.Context()) && !strings.HasPrefix(r.URL.Path, "/api/v1/settings/updates") && r.URL.Path != "/api/v1/settings/maintenance" && r.URL.Path != "/api/v1/auth/login" && r.URL.Path != "/api/v1/auth/logout" && r.URL.Path != "/api/v1/backup" {
				fail(w, 503, "Shipyard is in maintenance mode")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
func (a *API) get(w http.ResponseWriter, r *http.Request, write bool) (model.Resource, bool) {
	resource, e := a.Store.Resource(r.Context(), chi.URLParam(r, "id"))
	if e != nil {
		a.err(w, e)
		return resource, false
	}
	if !a.Store.Access(r.Context(), user(r), resource, write) {
		fail(w, 403, "You do not have access to this resource")
		return resource, false
	}
	if write && model.IsDeleting(resource) && r.Method != "DELETE" {
		fail(w, 409, db.ErrDeleting.Error())
		return resource, false
	}
	return resource, true
}
func (a *API) admin(w http.ResponseWriter, r *http.Request) bool {
	if !user(r).Admin {
		fail(w, 403, "Platform administrator access required")
		return false
	}
	return true
}
func (a *API) resource(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, false)
	if ok {
		v.CanWrite = a.Store.Access(r.Context(), user(r), v, true)
		respond(w, 200, a.Store.Public(v))
	}
}
func (a *API) resources(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.Resources(r.Context(), r.URL.Query().Get("kind"))
	if e != nil {
		a.err(w, e)
		return
	}
	out := []model.Resource{}
	for _, v := range rows {
		if a.Store.Access(r.Context(), user(r), v, false) {
			v.CanWrite = a.Store.Access(r.Context(), user(r), v, true)
			out = append(out, a.Store.Public(v))
		}
	}
	respond(w, 200, out)
}
func (a *API) validateParent(ctx context.Context, u model.User, in *model.ResourceInput, id string) error {
	global := in.Kind == "server" || in.Kind == "git" || in.Kind == "dns" || in.Kind == "zone" || in.Kind == "team"
	if global {
		if !u.Admin {
			return errors.New("platform administrator required")
		}
		if in.Kind == "team" {
			in.TeamID = id
			in.ParentID = ""
		} else {
			in.TeamID = ""
			if in.Kind != "zone" {
				in.ParentID = ""
			}
		}
		if in.Kind == "zone" {
			p, e := a.Store.Resource(ctx, in.ParentID)
			if e != nil || p.Kind != "dns" {
				return errors.New("zone requires a DNS provider connection")
			}
		}
		return nil
	}
	if in.Kind == "webhook" {
		if !u.Admin && !a.Store.TeamOwner(ctx, u.ID, in.TeamID) {
			return errors.New("team owner required")
		}
		return nil
	}
	parent, e := a.Store.Resource(ctx, in.ParentID)
	if e != nil {
		return errors.New("parent resource not found")
	}
	expected := map[string]string{"project": "team", "environment": "project", "application": "environment", "route": "application"}
	if parent.Kind != expected[in.Kind] {
		return errors.New("invalid resource hierarchy")
	}
	in.TeamID = parent.TeamID
	if !a.Store.Access(ctx, u, parent, true) {
		return errors.New("you cannot modify this project")
	}
	return nil
}
func (a *API) validateBindings(ctx context.Context, in model.ResourceInput) error {
	refs := map[string]string{}
	if in.Kind == "application" {
		spec, e := model.Decode[model.App](model.Resource{Data: in.Data})
		if e != nil {
			return e
		}
		if spec.PreviewOf != "" || spec.PR != 0 || spec.ApprovedSHA != "" || spec.PreviewSHA != "" || spec.PreviewClosed {
			return errors.New("preview metadata is managed by Shipyard")
		}
		refs[spec.ServerID] = "server"
		if spec.Source != "compose" {
			refs[spec.GitID] = "git"
		}
		if spec.PreviewZoneID != "" {
			refs[spec.PreviewZoneID] = "zone"
		}
	}
	if in.Kind == "route" {
		spec, e := model.Decode[model.Route](model.Resource{Data: in.Data})
		if e != nil {
			return e
		}
		if spec.ZoneID != "" {
			refs[spec.ZoneID] = "zone"
		}
	}
	for id, kind := range refs {
		v, e := a.Store.Resource(ctx, id)
		if e != nil || v.Kind != kind {
			return fmt.Errorf("invalid %s reference", kind)
		}
		if !a.Store.TeamGranted(ctx, in.TeamID, id) {
			return fmt.Errorf("%s must be granted to this team first", kind)
		}
	}
	return nil
}
func (a *API) saveResource(w http.ResponseWriter, r *http.Request) {
	var in model.ResourceInput
	if !decode(w, r, &in) {
		return
	}
	id := chi.URLParam(r, "id")
	creating := id == ""
	previousServerID := ""
	if creating {
		id = uuid.NewString()
	} else {
		old, ok := a.get(w, r, true)
		if !ok {
			return
		}
		if in.Kind != "" && in.Kind != old.Kind || in.ParentID != "" && in.ParentID != old.ParentID || in.TeamID != "" && in.TeamID != old.TeamID {
			fail(w, 400, "Resource kind and hierarchy cannot be changed")
			return
		}
		in.Kind = old.Kind
		if protectedResource(old.ID) && old.ID != control.LocalServerID {
			fail(w, 403, "System resources are managed by Shipyard")
			return
		}
		if old.Kind == "server" {
			previous, _ := model.Decode[model.Server](old)
			next, _ := model.Decode[model.Server](model.Resource{Data: in.Data})
			if previous.Connection != next.Connection || previous.DaemonID != next.DaemonID {
				fail(w, 403, "Server transport and Docker identity are managed by Shipyard")
				return
			}
		}
		in.ParentID = old.ParentID
		in.TeamID = old.TeamID
		if old.Kind == "application" {
			previous, _ := model.Decode[model.App](old)
			next, _ := model.Decode[model.App](model.Resource{Data: in.Data})
			if previous.PreviewOf != "" {
				fail(w, 409, "Preview configuration is managed from the source application")
				return
			}
			if previous.ServerID != next.ServerID {
				previousServerID = previous.ServerID
				var active bool
				_ = a.Store.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM app_runtime WHERE app_id=$1)", old.ID).Scan(&active)
				if active {
					fail(w, 409, "Create a new application to move an existing deployment to another host")
					return
				}
			}
		}
		if old.Kind == "route" {
			previous, _ := model.Decode[model.Route](old)
			next, _ := model.Decode[model.Route](model.Resource{Data: in.Data})
			if previous.Domain != next.Domain || previous.ZoneID != next.ZoneID {
				fail(w, 409, "Remove and recreate the route to change its domain or DNS zone safely")
				return
			}
		}
	}
	if e := a.validateParent(r.Context(), user(r), &in, id); e != nil {
		fail(w, 403, e.Error())
		return
	}
	if creating && in.Kind == "server" {
		spec, _ := model.Decode[model.Server](model.Resource{Data: in.Data})
		if spec.Connection == "local" || spec.DaemonID != "" {
			fail(w, 403, "Local host is registered automatically")
			return
		}
	}
	if in.Kind == "application" {
		spec, _ := model.Decode[model.App](model.Resource{Data: in.Data})
		if spec.PreviewDomain != "" {
			domain, err := model.Domain(spec.PreviewDomain)
			if err != nil {
				fail(w, 400, err.Error())
				return
			}
			spec.PreviewDomain = domain
			in.Data, _ = json.Marshal(spec)
		}
		var previous model.App
		if !creating {
			old, _ := a.Store.Resource(r.Context(), id)
			previous, _ = model.Decode[model.App](old)
		}
		before, _ := json.Marshal(previous.PublishedPorts)
		after, _ := json.Marshal(spec.PublishedPorts)
		if !user(r).Admin && len(previous.PublishedPorts)+len(spec.PublishedPorts) > 0 && string(before) != string(after) {
			fail(w, 403, "Only platform administrators may configure published host ports")
			return
		}
		if e := a.Control.ValidateNetworkSettings(r.Context(), model.Resource{TeamID: in.TeamID}, spec); e != nil {
			fail(w, 400, e.Error())
			return
		}
		if e := a.Control.ValidatePreviewDomain(r.Context(), id, in.TeamID, spec); e != nil {
			fail(w, 400, e.Error())
			return
		}
		if spec.Source == "compose" {
			var values map[string]any
			_ = json.Unmarshal(in.Data, &values)
			if values == nil {
				values = map[string]any{}
			}
			values["context"] = "."
			values["file"] = "compose.yaml"
			in.Data, _ = json.Marshal(values)
			source, provided := in.Secrets["compose"]
			if !provided && !creating {
				old, err := a.Store.Resource(r.Context(), id)
				if err != nil {
					a.err(w, err)
					return
				}
				secrets, err := a.Store.Secrets(old)
				if err != nil {
					a.err(w, err)
					return
				}
				source = secrets["compose"]
			}
			if err := model.ValidateComposeSource(source); err != nil {
				fail(w, 400, err.Error())
				return
			}
		}
	}
	if in.Kind == "zone" {
		if e := a.validateZoneSelection(r, &in); e != nil {
			fail(w, 400, e.Error())
			return
		}
	}
	if in.Kind == "network" {
		fail(w, 400, "Use the server network creation interface")
		return
	}
	if in.Kind == "route" {
		if err := model.Validate(in); err != nil {
			fail(w, 400, err.Error())
			return
		}
		v, _ := model.Decode[model.Route](model.Resource{Data: in.Data})
		canonical, err := model.Domain(v.Domain)
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		v.Domain = canonical
		in.Data, _ = json.Marshal(v)
		zone, e := a.Store.Resource(r.Context(), v.ZoneID)
		if e != nil {
			fail(w, 400, "Select a connected DNS zone")
			return
		}
		z, _ := model.Decode[model.Zone](zone)
		if !strings.HasSuffix(v.Domain, "."+z.Domain) && v.Domain != z.Domain {
			fail(w, 400, "Route domain does not belong to the selected zone")
			return
		}
	}
	if e := model.Validate(in); e != nil {
		fail(w, 400, e.Error())
		return
	}
	if e := a.validateBindings(r.Context(), in); e != nil {
		fail(w, 400, e.Error())
		return
	}
	if in.Kind == "route" {
		if e := a.routeConflict(r.Context(), id, in); e != nil {
			fail(w, 409, e.Error())
			return
		}
	}
	v, e := a.Store.Save(r.Context(), id, in)
	if e != nil {
		if !creating && errors.Is(e, pgx.ErrNoRows) {
			fail(w, 409, "Resource was changed by another operation; refresh and try again")
			return
		}
		a.err(w, e)
		return
	}
	if creating && in.Kind == "team" {
		_, _ = a.Store.Pool.Exec(r.Context(), "INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,'owner')", v.ID, user(r).ID)
	}
	if v.Kind == "application" {
		spec, _ := model.Decode[model.App](v)
		if !spec.Previews {
			if e = a.Control.DisablePreviews(r.Context(), v.ID); e != nil {
				a.err(w, e)
				return
			}
		}
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "resource.saved", v.ID, v.TeamID, map[string]any{"kind": v.Kind, "version": v.Version})
	if previousServerID != "" {
		if e = a.Control.PruneProxySettings(r.Context(), previousServerID); e != nil {
			a.err(w, e)
			return
		}
	}
	if v.Kind == "route" {
		parent, parentErr := a.Store.Resource(r.Context(), v.ParentID)
		if parentErr != nil {
			a.err(w, parentErr)
			return
		}
		application, decodeErr := model.Decode[model.App](parent)
		if decodeErr != nil {
			a.err(w, decodeErr)
			return
		}
		if e = a.Control.PruneProxySettings(r.Context(), application.ServerID); e != nil {
			a.err(w, e)
			return
		}
		spec, _ := model.Decode[model.Route](v)
		if spec.ZoneID != "" {
			_ = a.Store.Enqueue(r.Context(), "domain", v.ID, uuid.NewString(), nil)
		} else {
			_, _ = a.Store.Pool.Exec(r.Context(), "INSERT INTO domain_state(route_id,domain,dns_state,propagation_state,certificate_state) VALUES($1,$2,'unmanaged','unmanaged','off') ON CONFLICT(route_id) DO NOTHING", v.ID, spec.Domain)
			app, _ := a.Store.Resource(r.Context(), v.ParentID)
			spec, _ := model.Decode[model.App](app)
			_ = a.Store.Enqueue(r.Context(), "proxy", spec.ServerID, uuid.NewString(), nil)
		}
	}
	v.CanWrite = true
	respond(w, 200, a.Store.Public(v))
}
func (a *API) routeConflict(ctx context.Context, id string, in model.ResourceInput) error {
	app, e := a.Store.Resource(ctx, in.ParentID)
	if e != nil {
		return e
	}
	spec, _ := model.Decode[model.App](app)
	candidate, _ := model.Decode[model.Route](model.Resource{Data: in.Data})
	candidateDomain, _ := model.Domain(candidate.Domain)
	rows, e := a.Store.Resources(ctx, "route")
	if e != nil {
		return e
	}
	for _, rr := range rows {
		if rr.ID == id {
			continue
		}
		existing, _ := model.Decode[model.Route](rr)
		parent, e := a.Store.Resource(ctx, rr.ParentID)
		if e != nil {
			return e
		}
		other, _ := model.Decode[model.App](parent)
		if candidate.Protocol == "tcp" && existing.Protocol == "tcp" && spec.ServerID == other.ServerID && candidate.ListenPort == existing.ListenPort {
			return errors.New("TCP listener port is already assigned")
		}
		existingDomain, _ := model.Domain(existing.Domain)
		if candidateDomain != "" && candidateDomain == existingDomain {
			if spec.ServerID != other.ServerID {
				return errors.New("hostname is already assigned to another server")
			}
			if candidate.Protocol != "tcp" && existing.Protocol != "tcp" {
				return errors.New("hostname is already assigned")
			}
		}
	}
	return nil
}
func (a *API) deleteResource(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if protectedResource(v.ID) {
		fail(w, 403, "Shipyard infrastructure cannot be deleted here")
		return
	}
	if v.Kind == "server" {
		a.serverDeletionExecute(w, r)
		return
	}
	if v.Kind == "network" {
		if model.IsDeleting(v) {
			fail(w, 409, db.ErrDeleting.Error())
			return
		}
		id := uuid.NewString()
		if e := a.Store.Enqueue(r.Context(), "network-delete", v.ID, "network-delete:"+id, nil); e != nil {
			a.err(w, e)
			return
		}
		_ = a.Store.Audit(r.Context(), user(r).ID, "network.deletion_requested", v.ID, "", nil)
		respond(w, 202, map[string]bool{"ok": true})
		return
	}
	if v.Kind == "application" || v.Kind == "project" {
		id, err := a.Control.QueueDeletion(r.Context(), v, user(r).ID)
		if err != nil {
			if errors.Is(err, db.ErrDeleting) {
				fail(w, 409, err.Error())
			} else {
				a.err(w, err)
			}
			return
		}
		respond(w, 202, map[string]any{"ok": true, "jobId": id})
		return
	}
	if model.IsDeleting(v) {
		fail(w, 409, db.ErrDeleting.Error())
		return
	}
	children, e := a.Store.Children(r.Context(), v.ID, "")
	if e != nil {
		a.err(w, e)
		return
	}
	if len(children) > 0 {
		fail(w, 409, "Remove child resources first")
		return
	}
	if v.Kind == "route" {
		if e = a.Control.DeleteDomain(r.Context(), v.ID); e != nil {
			fail(w, 409, e.Error())
			return
		}
	}
	var used bool
	_ = a.Store.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM resources WHERE data->>'serverId'=$1 OR data->>'gitId'=$1 OR data->>'zoneId'=$1 OR data->>'previewZoneId'=$1)", v.ID).Scan(&used)
	if used {
		fail(w, 409, "Resource is still referenced by an application or route")
		return
	}
	_, e = a.Store.Pool.Exec(r.Context(), "DELETE FROM resources WHERE id=$1", v.ID)
	if e != nil {
		a.err(w, e)
		return
	}
	if v.Kind == "route" {
		parent, _ := a.Store.Resource(r.Context(), v.ParentID)
		app, _ := model.Decode[model.App](parent)
		if e = a.Control.PruneProxySettings(r.Context(), app.ServerID); e != nil {
			a.err(w, e)
			return
		}
		_ = a.Store.Enqueue(r.Context(), "proxy", app.ServerID, uuid.NewString(), nil)
	}
	if v.Kind == "server" {
		if _, e = a.Store.Pool.Exec(r.Context(), "DELETE FROM settings WHERE key=$1", control.ProxySettingsKey(v.ID)); e != nil {
			a.err(w, e)
			return
		}
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "resource.deleted", v.ID, v.TeamID, nil)
	respond(w, 200, map[string]bool{"ok": true})
}
func (a *API) grant(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if v.Kind != "server" && v.Kind != "git" && v.Kind != "zone" && v.Kind != "network" {
		fail(w, 400, "Only servers, Git connections and zones can be granted")
		return
	}
	var in struct {
		TeamID  string `json:"teamId"`
		Granted bool   `json:"granted"`
	}
	if !decode(w, r, &in) {
		return
	}
	team, e := a.Store.Resource(r.Context(), in.TeamID)
	if e != nil || team.Kind != "team" {
		fail(w, 400, "Team not found")
		return
	}
	if in.Granted {
		_, e = a.Store.Pool.Exec(r.Context(), "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2) ON CONFLICT DO NOTHING", v.ID, in.TeamID)
	} else {
		_, e = a.Store.Pool.Exec(r.Context(), "DELETE FROM resource_grants WHERE resource_id=$1 AND team_id=$2", v.ID, in.TeamID)
	}
	if e != nil {
		a.err(w, e)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "resource.grant", v.ID, in.TeamID, in)
	respond(w, 200, map[string]bool{"ok": true})
}
func (a *API) grants(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	v, ok := a.get(w, r, false)
	if !ok {
		return
	}
	rows, e := a.Store.Pool.Query(r.Context(), "SELECT team_id FROM resource_grants WHERE resource_id=$1", v.ID)
	if e != nil {
		a.err(w, e)
		return
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	respond(w, 200, ids)
}
func (a *API) fingerprint(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	var in struct {
		Host string `json:"host"`
		Port int    `json:"port"`
	}
	if !decode(w, r, &in) {
		return
	}
	fp, e := remote.Fingerprint(r.Context(), in.Host, in.Port)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	respond(w, 200, map[string]string{"fingerprint": fp})
}
func (a *API) provision(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if v.ID == control.LocalServerID {
		fail(w, 400, "Local host does not require SSH provisioning")
		return
	}
	if v.Kind != "server" {
		fail(w, 400, "Server required")
		return
	}
	e := a.Store.Enqueue(r.Context(), "provision", v.ID, uuid.NewString(), nil)
	if e != nil {
		a.err(w, e)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "server.provision_requested", v.ID, "", nil)
	respond(w, 202, map[string]bool{"queued": true})
}
func (a *API) testServer(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if v.ID == control.LocalServerID {
		node, _, e := a.Control.LocalClient(r.Context())
		if e != nil {
			fail(w, 400, e.Error())
			return
		}
		out, e := remote.Output(r.Context(), node, "docker", "version", "--format", "{{.Server.Version}}")
		if e != nil {
			fail(w, 400, e.Error())
			return
		}
		respond(w, 200, map[string]string{"dockerVersion": out, "connection": "local"})
		return
	}
	spec, e := model.Decode[model.Server](v)
	if e != nil {
		a.err(w, e)
		return
	}
	secrets, e := a.Store.Secrets(v)
	if e != nil {
		a.err(w, e)
		return
	}
	client, e := remote.Dial(r.Context(), spec, secrets["private_key"], secrets["password"])
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	defer client.Close()
	out, e := client.Output(r.Context(), "docker", "version", "--format", "{{.Server.Version}}")
	if e != nil {
		fail(w, 400, "SSH connected, but Docker is unavailable")
		return
	}
	respond(w, 200, map[string]string{"dockerVersion": out, "status": "connected"})
}
func (a *API) metrics(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, false)
	if !ok {
		return
	}
	rows, e := a.Store.Pool.Query(r.Context(), "SELECT data FROM (SELECT data,created_at FROM metrics WHERE resource_id=$1 ORDER BY created_at DESC LIMIT 2880) m ORDER BY created_at", v.ID)
	if e != nil {
		a.err(w, e)
		return
	}
	defer rows.Close()
	out := []json.RawMessage{}
	for rows.Next() {
		var b []byte
		if rows.Scan(&b) == nil {
			out = append(out, b)
		}
	}
	respond(w, 200, out)
}
func (a *API) git(w http.ResponseWriter, r *http.Request) (*providers.GitClient, bool) {
	v, ok := a.get(w, r, false)
	if !ok {
		return nil, false
	}
	if v.Kind != "git" {
		fail(w, 400, "Git connection required")
		return nil, false
	}
	client, e := a.gitAuth().Client(r.Context(), v)
	if e != nil {
		a.err(w, e)
		return nil, false
	}
	return client, true
}
func (a *API) repositories(w http.ResponseWriter, r *http.Request) {
	g, ok := a.git(w, r)
	if !ok {
		return
	}
	v, e := g.Repositories(r.Context())
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	respond(w, 200, v)
}
func (a *API) branches(w http.ResponseWriter, r *http.Request) {
	g, ok := a.git(w, r)
	if !ok {
		return
	}
	v, e := g.Branches(r.Context(), r.URL.Query().Get("repository"))
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	respond(w, 200, v)
}
func (a *API) providerZones(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	v, ok := a.get(w, r, false)
	if !ok {
		return
	}
	spec, _ := model.Decode[model.DNS](v)
	s, e := a.Store.Secrets(v)
	if e != nil {
		a.err(w, e)
		return
	}
	var provider providers.DNSProvider = providers.NewDNS(spec.Provider, s["token"])
	if a.Control.DNSFactory != nil {
		provider = a.Control.DNSFactory(spec.Provider, s["token"])
	}
	zones, e := provider.Zones(r.Context())
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	respond(w, 200, zones)
}
func (a *API) zone(w http.ResponseWriter, r *http.Request, write bool) (providers.DNSProvider, model.Zone, bool) {
	v, ok := a.get(w, r, false)
	if !ok {
		return nil, model.Zone{}, false
	}
	if v.Kind != "zone" {
		fail(w, 400, "DNS zone required")
		return nil, model.Zone{}, false
	}
	if write && !user(r).Admin {
		var allowed bool
		_ = a.Store.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM resource_grants g JOIN team_members m ON g.team_id=m.team_id WHERE g.resource_id=$1 AND m.user_id=$2 AND m.role='owner')", v.ID, user(r).ID).Scan(&allowed)
		if !allowed {
			fail(w, 403, "Team owner required to edit zone records")
			return nil, model.Zone{}, false
		}
	}
	p, z, _, e := a.Control.DNS(r.Context(), v.ID)
	if e != nil {
		a.err(w, e)
		return nil, z, false
	}
	return p, z, true
}
func (a *API) records(w http.ResponseWriter, r *http.Request) {
	p, z, ok := a.zone(w, r, false)
	if !ok {
		return
	}
	records, e := p.Records(r.Context(), z.ProviderZoneID)
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	respond(w, 200, records)
}
func (a *API) putRecord(w http.ResponseWriter, r *http.Request) {
	p, z, ok := a.zone(w, r, true)
	if !ok {
		return
	}
	var in model.DNSRecord
	if !decode(w, r, &in) {
		return
	}
	in.ID = chi.URLParam(r, "record")
	if in.Name != z.Domain && !strings.HasSuffix(in.Name, "."+z.Domain) {
		fail(w, 400, "Record must belong to this zone")
		return
	}
	record, e := p.Put(r.Context(), z.ProviderZoneID, in)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "dns.record_saved", chi.URLParam(r, "id"), "", map[string]string{"recordId": record.ID, "name": record.Name, "type": record.Type})
	respond(w, 200, record)
}
func (a *API) deleteRecord(w http.ResponseWriter, r *http.Request) {
	p, z, ok := a.zone(w, r, true)
	if !ok {
		return
	}
	if e := p.Delete(r.Context(), z.ProviderZoneID, chi.URLParam(r, "record")); e != nil {
		fail(w, 502, e.Error())
		return
	}
	respond(w, 200, map[string]bool{"ok": true})
}
func (a *API) domainStatus(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, false)
	if !ok {
		return
	}
	state, e := a.Control.DomainState(r.Context(), v.ID)
	if errors.Is(e, pgx.ErrNoRows) {
		respond(w, 200, map[string]string{"dns": "unmanaged", "certificate": "off", "routing": "pending"})
		return
	}
	if e != nil {
		a.err(w, e)
		return
	}
	respond(w, 200, state)
}
func (a *API) syncDomain(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	var in struct {
		Mode string `json:"mode"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Mode != "" && in.Mode != "adopt" && in.Mode != "replace" {
		fail(w, 400, "Invalid DNS reconciliation mode")
		return
	}
	e := a.Store.Enqueue(r.Context(), "domain", v.ID, uuid.NewString(), in)
	if e != nil {
		a.err(w, e)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "domain.sync", v.ID, v.TeamID, in)
	respond(w, 202, map[string]bool{"queued": true})
}
func (a *API) runtime(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, false)
	if !ok {
		return
	}
	runtime, e := a.Control.Runtime(r.Context(), v.ID)
	if errors.Is(e, pgx.ErrNoRows) {
		respond(w, 200, map[string]string{"status": "not_deployed"})
		return
	}
	if e != nil {
		a.err(w, e)
		return
	}
	respond(w, 200, runtime)
}
func (a *API) deploy(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	var in struct {
		Ref     string `json:"ref"`
		Version int    `json:"version,omitempty"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Version != 0 && in.Version != v.Version {
		fail(w, 409, "Application changed; reload before deploying")
		return
	}
	spec, _ := model.Decode[model.App](v)
	if spec.PreviewOf != "" {
		if in.Ref == "" {
			in.Ref = spec.ApprovedSHA
		}
		if spec.ApprovedSHA == "" || in.Ref != spec.ApprovedSHA {
			fail(w, 403, "Approve this exact preview commit before deployment")
			return
		}
	}
	d, e := a.Control.Queue(r.Context(), v, in.Ref, "")
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "deployment.requested", v.ID, v.TeamID, map[string]string{"deploymentId": d.ID})
	respond(w, 202, d)
}
func (a *API) rollback(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	var in struct {
		ReleaseID string `json:"releaseId"`
	}
	if !decode(w, r, &in) {
		return
	}
	release, e := a.Store.Release(r.Context(), in.ReleaseID)
	if e != nil || release.AppID != v.ID {
		fail(w, 404, "Retained release not found")
		return
	}
	d, e := a.Control.Queue(r.Context(), v, "", in.ReleaseID)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "rollback.requested", v.ID, v.TeamID, in)
	respond(w, 202, d)
}
func (a *API) action(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	spec, _ := model.Decode[model.App](v)
	if spec.PreviewClosed {
		fail(w, 409, "Pull request preview is closed")
		return
	}
	var in struct {
		Action string `json:"action"`
	}
	if !decode(w, r, &in) {
		return
	}
	if e := a.Control.Action(r.Context(), v, in.Action); e != nil {
		fail(w, 400, e.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "application."+in.Action, v.ID, v.TeamID, nil)
	respond(w, 200, map[string]bool{"ok": true})
}
func (a *API) approvePreview(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	var in struct {
		SHA string `json:"sha"`
	}
	if !decode(w, r, &in) {
		return
	}
	if e := a.Control.ApprovePreview(r.Context(), v.ID, in.SHA); e != nil {
		fail(w, 400, e.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "preview.approved", v.ID, v.TeamID, in)
	respond(w, 202, map[string]bool{"queued": true})
}
func (a *API) releases(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, false)
	if !ok {
		return
	}
	rows, e := a.Store.Pool.Query(r.Context(), "SELECT r.id FROM releases r JOIN deployments d ON d.id=r.deployment_id WHERE r.app_id=$1 AND d.state='healthy' ORDER BY r.created_at DESC LIMIT 50", v.ID)
	if e != nil {
		a.err(w, e)
		return
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	out := []map[string]any{}
	for _, id := range ids {
		release, e := a.Store.Release(r.Context(), id)
		if e != nil {
			a.err(w, e)
			return
		}
		out = append(out, map[string]any{"id": release.ID, "commit": release.Commit, "images": release.Images, "createdAt": release.CreatedAt})
	}
	respond(w, 200, out)
}
func (a *API) deployments(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Store.Deployments(r.Context(), r.URL.Query().Get("applicationId"))
	if e != nil {
		a.err(w, e)
		return
	}
	out := []model.Deployment{}
	for _, d := range rows {
		app, e := a.Store.Resource(r.Context(), d.AppID)
		if e == nil && a.Store.Access(r.Context(), user(r), app, false) {
			out = append(out, d)
		}
	}
	respond(w, 200, out)
}
func (a *API) deployment(w http.ResponseWriter, r *http.Request) {
	d, e := a.Store.Deployment(r.Context(), chi.URLParam(r, "id"))
	if e != nil {
		a.err(w, e)
		return
	}
	app, e := a.Store.Resource(r.Context(), d.AppID)
	if e != nil || !a.Store.Access(r.Context(), user(r), app, false) {
		fail(w, 403, "Access denied")
		return
	}
	respond(w, 200, d)
}
func (a *API) hook(w http.ResponseWriter, r *http.Request) {
	connection, e := a.Store.Resource(r.Context(), chi.URLParam(r, "id"))
	if e != nil || connection.Kind != "git" {
		fail(w, 404, "Connection not found")
		return
	}
	if !a.limits.Allow("hook:" + connection.ID + ":" + time.Now().Format("200601021504")) {
		fail(w, 429, "Webhook rate limit exceeded")
		return
	}
	secrets, e := a.Store.Secrets(connection)
	if e != nil {
		a.err(w, e)
		return
	}
	body, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 2<<20))
	if e != nil {
		fail(w, 413, "Webhook payload too large")
		return
	}
	spec, _ := model.Decode[model.Git](connection)
	signature, delivery, event := r.Header.Get("X-Hub-Signature-256"), r.Header.Get("X-GitHub-Delivery"), r.Header.Get("X-GitHub-Event")
	if spec.Provider == "gitea" {
		signature = r.Header.Get("X-Gitea-Signature")
		delivery = r.Header.Get("X-Gitea-Delivery")
		event = r.Header.Get("X-Gitea-Event")
	}
	if delivery == "" || len(delivery) > 200 || !providers.VerifyWebhook(secrets["webhook_secret"], body, signature) {
		fail(w, 401, "Invalid webhook signature or delivery ID")
		return
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(body, &fields) != nil || fields == nil {
		fail(w, 400, "Webhook payload must be a JSON object")
		return
	}
	// Older Git services can include the shared signing secret in the payload.
	// Its signature was checked above; never persist that credential in a job.
	delete(fields, "secret")
	body, e = json.Marshal(fields)
	if e != nil {
		a.err(w, e)
		return
	}
	tx, e := a.Store.Pool.Begin(r.Context())
	if e != nil {
		a.err(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	count, e := query.New(tx).SeenDelivery(r.Context(), query.SeenDeliveryParams{ProviderID: connection.ID, DeliveryID: delivery})
	if e != nil {
		a.err(w, e)
		return
	}
	if count > 0 {
		payload, _ := json.Marshal(map[string]any{"event": event, "body": json.RawMessage(body), "delivery": delivery})
		_, e = tx.Exec(r.Context(), "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'git-event',$2,$3,$4)", uuid.NewString(), connection.ID, payload, "hook:"+connection.ID+":"+delivery)
		if e != nil {
			a.err(w, e)
			return
		}
	}
	if e = tx.Commit(r.Context()); e != nil {
		a.err(w, e)
		return
	}
	respond(w, 202, map[string]bool{"accepted": true})
}
func clientIP(r *http.Request) string {
	host, _, e := net.SplitHostPort(r.RemoteAddr)
	if e != nil {
		return r.RemoteAddr
	}
	return host
}
func queryInt(r *http.Request, key string) int64 {
	v, _ := strconv.ParseInt(r.URL.Query().Get(key), 10, 64)
	return v
}
func (a *API) maintenance(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if a.Updates != nil {
		operation, e := a.Updates.ReadOperation(r.Context())
		if e != nil {
			a.err(w, e)
			return
		}
		if operation.Active() || operation.State == "recovery_required" {
			fail(w, 409, "Resolve the system version change before changing maintenance mode")
			return
		}
	}
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if !decode(w, r, &in) {
		return
	}
	_, e := a.Store.Pool.Exec(r.Context(), "UPDATE settings SET value=$1 WHERE key='maintenance'", jsonBytes(in.Enabled))
	if e != nil {
		a.err(w, e)
		return
	}
	respond(w, 200, in)
}
func (a *API) export(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if !a.Store.Maintenance(r.Context()) {
		fail(w, 409, "Enable maintenance mode before exporting")
		return
	}
	var in struct {
		Passphrase string `json:"passphrase"`
	}
	if !decode(w, r, &in) {
		return
	}
	data, e := backup.Export(r.Context(), a.Store, a.DatabaseURL, a.Control.DataDir, in.Passphrase)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=shipyard-"+time.Now().UTC().Format("20060102-150405")+".sybackup")
	_, _ = w.Write(data)
}
