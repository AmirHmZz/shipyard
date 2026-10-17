package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"shipyard/internal/model"
	"shipyard/internal/providers"
)

func (a *API) networks(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	server, ok := a.get(w, r, false)
	if !ok {
		return
	}
	if server.Kind != "server" {
		fail(w, 400, "server required")
		return
	}
	if r.Method == "GET" {
		items, e := a.Control.NetworkInventory(r.Context(), server.ID)
		if e != nil {
			fail(w, 502, e.Error())
			return
		}
		respond(w, 200, items)
		return
	}
	var input struct {
		Name string `json:"name"`
		model.Network
	}
	if !decode(w, r, &input) {
		return
	}
	n, e := a.Control.NewNetwork(r.Context(), server.ID, input.Name, input.DockerID, input.Network)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "network.created", n.ID, "", nil)
	respond(w, 202, a.Store.Public(n))
}
func (a *API) applicationServices(w http.ResponseWriter, r *http.Request) {
	app, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if app.Kind != "application" {
		fail(w, 400, "application required")
		return
	}
	services, e := a.Control.Services(r.Context(), app)
	if e != nil {
		fail(w, 422, e.Error())
		return
	}
	respond(w, 200, services)
}
func (a *API) networking(w http.ResponseWriter, r *http.Request) {
	app, ok := a.get(w, r, r.Method != "GET")
	if !ok {
		return
	}
	if app.Kind != "application" {
		fail(w, 400, "application required")
		return
	}
	spec, e := model.Decode[model.App](app)
	if e != nil {
		a.err(w, e)
		return
	}
	if r.Method == "GET" {
		var active map[string]model.ServiceNetworking
		release, err := a.Store.Active(r.Context(), app.ID)
		if err == nil {
			active = release.App.Networking
		}
		if active == nil {
			active = map[string]model.ServiceNetworking{}
		}
		if spec.Networking == nil {
			spec.Networking = map[string]model.ServiceNetworking{}
		}
		respond(w, 200, map[string]any{"version": app.Version, "services": spec.Networking, "applied": active, "endpoints": release.Networks, "pending": !reflect.DeepEqual(active, spec.Networking)})
		return
	}
	var input struct {
		Version  int                                `json:"version"`
		Services map[string]model.ServiceNetworking `json:"services"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Version != app.Version {
		fail(w, 409, "Application changed; reload before saving")
		return
	}
	if spec.PreviewOf != "" {
		fail(w, 403, "Preview networking is isolated and managed automatically")
		return
	}
	spec.Networking = input.Services
	if e = model.ValidateNetworking(spec); e != nil {
		fail(w, 400, e.Error())
		return
	}
	if e = a.Control.ValidateNetworkSettings(r.Context(), app, spec); e != nil {
		fail(w, 400, e.Error())
		return
	}
	data, _ := json.Marshal(spec)
	saved, e := a.Store.Save(r.Context(), app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: data, Version: input.Version})
	if e != nil {
		a.err(w, e)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "application.networking_saved", app.ID, app.TeamID, nil)
	respond(w, 200, a.Store.Public(saved))
}
func (a *API) publishedPorts(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	app, ok := a.get(w, r, r.Method != "GET")
	if !ok {
		return
	}
	if app.Kind != "application" {
		fail(w, 400, "application required")
		return
	}
	spec, e := model.Decode[model.App](app)
	if e != nil {
		a.err(w, e)
		return
	}
	if r.Method == "GET" {
		respond(w, 200, map[string]any{"version": app.Version, "services": spec.PublishedPorts})
		return
	}
	var input struct {
		Version  int                              `json:"version"`
		Services map[string][]model.PublishedPort `json:"services"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Version != app.Version {
		fail(w, 409, "Application changed; reload before saving")
		return
	}
	if spec.PreviewOf != "" {
		fail(w, 400, "Previews cannot publish host ports")
		return
	}
	spec.PublishedPorts = input.Services
	if e = model.ValidateNetworking(spec); e != nil {
		fail(w, 400, e.Error())
		return
	}
	data, _ := json.Marshal(spec)
	saved, e := a.Store.Save(r.Context(), app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: data, Version: app.Version})
	if e != nil {
		a.err(w, e)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "application.published_ports_saved", app.ID, app.TeamID, input.Services)
	respond(w, 200, a.Store.Public(saved))
}
func (a *API) validateZoneSelection(r *http.Request, in *model.ResourceInput) error {
	connection, e := a.Store.Resource(r.Context(), in.ParentID)
	if e != nil {
		return e
	}
	dns, e := model.Decode[model.DNS](connection)
	if e != nil {
		return e
	}
	secrets, e := a.Store.Secrets(connection)
	if e != nil {
		return e
	}
	var provider providers.DNSProvider = providers.NewDNS(dns.Provider, secrets["token"])
	if a.Control.DNSFactory != nil {
		provider = a.Control.DNSFactory(dns.Provider, secrets["token"])
	}
	choices, e := provider.Zones(r.Context())
	if e != nil {
		return fmt.Errorf("could not verify provider zone: %w", e)
	}
	zone, e := model.Decode[model.Zone](model.Resource{Data: in.Data})
	if e != nil {
		return e
	}
	for _, choice := range choices {
		if choice.ID == zone.ProviderZoneID {
			domain, e := model.Domain(choice.Name)
			if e != nil {
				return e
			}
			in.Name = domain
			zone.Domain = domain
			in.Data, _ = json.Marshal(zone)
			return nil
		}
	}
	return fmt.Errorf("select an available zone from the chosen DNS provider")
}
