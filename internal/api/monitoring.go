package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"shipyard/internal/control"
	"shipyard/internal/db"
)

type monitoringResource struct {
	ID       string          `json:"id"`
	Kind     string          `json:"kind"`
	Name     string          `json:"name"`
	ServerID string          `json:"serverId"`
	Status   string          `json:"status"`
	Latest   *control.Metric `json:"latest"`
}

func (a *API) certificateSettings(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if r.Method == http.MethodPut {
		var v db.CertificateNetwork
		if !decode(w, r, &v) {
			return
		}
		if err := a.Store.SetCertificateNetwork(r.Context(), v); err != nil {
			fail(w, 400, err.Error())
			return
		}
		_ = a.Store.Audit(r.Context(), user(r).ID, "settings.certificates", "", "", v)
	}
	v, err := a.Store.CertificateNetwork(r.Context())
	if err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, v)
}
func (a *API) monitoringResources(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	rows, err := a.Store.Pool.Query(r.Context(), `SELECT r.id,r.kind,r.name,COALESCE(r.data->>'serverId',''),m.data FROM resources r LEFT JOIN LATERAL(SELECT data FROM metrics WHERE resource_id=r.id ORDER BY created_at DESC LIMIT 1)m ON true WHERE r.kind IN ('server','application') AND COALESCE(r.data->>'deleting','false')<>'true' ORDER BY r.kind DESC,r.name,r.id`)
	if err != nil {
		a.err(w, err)
		return
	}
	defer rows.Close()
	out := []monitoringResource{}
	for rows.Next() {
		var v monitoringResource
		var raw []byte
		if err = rows.Scan(&v.ID, &v.Kind, &v.Name, &v.ServerID, &raw); err != nil {
			a.err(w, err)
			return
		}
		v.Status = "pending"
		if len(raw) > 0 {
			m, decodeErr := control.DecodeMetric(raw)
			if decodeErr != nil {
				a.err(w, decodeErr)
				return
			}
			v.Latest = &m
			v.Status = m.Status
			if v.Status == "" {
				v.Status = "offline"
				if m.Online {
					v.Status = "online"
				}
			}
			if time.Since(m.At) > 90*time.Second {
				v.Status = "stale"
			}
		}
		out = append(out, v)
	}
	if err = rows.Err(); err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, out)
}
func (a *API) monitoringDefaults(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if r.Method == http.MethodPut {
		var v control.MonitoringDefaults
		if !decode(w, r, &v) {
			return
		}
		if err := a.Control.SetMonitoringDefaults(r.Context(), v); err != nil {
			fail(w, 400, err.Error())
			return
		}
		_ = a.Store.Audit(r.Context(), user(r).ID, "monitoring.defaults", "", "", nil)
	}
	v, err := a.Control.MonitoringDefaults(r.Context())
	if err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, v)
}
func (a *API) monitoringPolicy(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	resource, ok := a.get(w, r, false)
	if !ok {
		return
	}
	if resource.Kind != "server" && resource.Kind != "application" {
		fail(w, 400, "server or application required")
		return
	}
	if r.Method == http.MethodPut || r.Method == http.MethodDelete {
		v := control.MonitoringPolicyState{Mode: "inherit"}
		if r.Method == http.MethodPut && !decode(w, r, &v) {
			return
		}
		if err := a.Control.SetMonitoringPolicy(r.Context(), resource, v); err != nil {
			fail(w, 400, err.Error())
			return
		}
		_ = a.Store.Audit(r.Context(), user(r).ID, "monitoring.policy", resource.ID, resource.TeamID, map[string]string{"mode": v.Mode})
	}
	v, err := a.Control.MonitoringPolicy(r.Context(), resource)
	if err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, v)
}
func (a *API) monitoringIncidents(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	state, id := r.URL.Query().Get("state"), r.URL.Query().Get("resourceId")
	if state != "" && state != "pending" && state != "firing" && state != "resolved" {
		fail(w, 400, "invalid incident state")
		return
	}
	rows, err := a.Store.Pool.Query(r.Context(), "SELECT id,resource_id,kind,state,since,fired_at,resolved_at,destinations,data FROM monitoring_incidents WHERE ($1='' OR resource_id=$1) AND ($2='' OR state=$2) ORDER BY since DESC LIMIT 500", id, state)
	if err != nil {
		a.err(w, err)
		return
	}
	defer rows.Close()
	out := []control.MonitoringIncident{}
	for rows.Next() {
		var v control.MonitoringIncident
		var raw []byte
		if err = rows.Scan(&v.ID, &v.ResourceID, &v.Kind, &v.State, &v.Since, &v.FiredAt, &v.ResolvedAt, &raw, &v.Data); err != nil {
			a.err(w, err)
			return
		}
		if err = json.Unmarshal(raw, &v.Destinations); err != nil {
			a.err(w, err)
			return
		}
		out = append(out, v)
	}
	if err = rows.Err(); err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, out)
}
func (a *API) testNotification(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	hook, ok := a.get(w, r, false)
	if !ok {
		return
	}
	if hook.Kind != "webhook" {
		fail(w, 400, "notification integration required")
		return
	}
	delivery, err := a.Control.QueueTestNotification(r.Context(), hook)
	if err != nil {
		a.err(w, err)
		return
	}
	var job string
	if err = a.Store.Pool.QueryRow(r.Context(), "SELECT id FROM jobs WHERE dedupe=$1", "notification:"+delivery).Scan(&job); err != nil {
		a.err(w, err)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "notification.test", hook.ID, hook.TeamID, nil)
	respond(w, 202, map[string]string{"jobId": job})
}
func (a *API) notificationDelivery(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	hook, ok := a.get(w, r, false)
	if !ok {
		return
	}
	if hook.Kind != "webhook" {
		fail(w, 400, "notification integration required")
		return
	}
	out := map[string]any{"state": "none", "error": "", "at": nil}
	rows, err := a.Store.Pool.Query(r.Context(), "SELECT state,last_error,created_at FROM jobs WHERE kind='notify' AND resource_id=$1 AND COALESCE(payload->>'marker','false')<>'true' ORDER BY created_at DESC LIMIT 1", chi.URLParam(r, "id"))
	if err != nil {
		a.err(w, err)
		return
	}
	defer rows.Close()
	if rows.Next() {
		var state, message string
		var at time.Time
		if err = rows.Scan(&state, &message, &at); err != nil {
			a.err(w, err)
			return
		}
		out = map[string]any{"state": state, "error": message, "at": at}
	}
	if err = rows.Err(); err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, out)
}
