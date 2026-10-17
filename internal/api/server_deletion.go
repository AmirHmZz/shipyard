package api

import (
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"net/http"
	"shipyard/internal/control"
	"shipyard/internal/db"
	"shipyard/internal/model"
)

func (a *API) serverDeletionPlan(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	host, ok := a.get(w, r, false)
	if !ok {
		return
	}
	if host.Kind != "server" || control.Protected(host.ID) {
		fail(w, 403, "Shipyard infrastructure cannot be deleted")
		return
	}
	p, e := a.Control.PlanServerDeletion(r.Context(), host.ID, user(r).ID)
	if e != nil {
		a.deletionError(w, e)
		return
	}
	respond(w, 200, p)
}
func (a *API) serverDeletionExecute(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	host, ok := a.get(w, r, false)
	if !ok {
		return
	}
	s, _ := model.Decode[model.Server](host)
	if host.Kind != "server" || s.Connection == "local" || control.Protected(host.ID) {
		fail(w, 403, "Shipyard infrastructure cannot be deleted")
		return
	}
	var in control.ServerDeletionInput
	if !decode(w, r, &in) {
		return
	}
	id, e := a.Control.QueueServerDeletion(r.Context(), host.ID, user(r).ID, in)
	if e != nil {
		a.deletionError(w, e)
		return
	}
	respond(w, 202, map[string]any{"ok": true, "jobId": id})
}
func (a *API) serverDeletionStatus(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	status, e := a.Control.ServerDeletion(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "No server cleanup operation")
		return
	}
	if e != nil {
		a.err(w, e)
		return
	}
	respond(w, 200, status)
}
func (a *API) serverDeletionRetry(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	id, e := a.Control.RetryServerDeletion(r.Context(), chi.URLParam(r, "id"))
	if e != nil {
		a.deletionError(w, e)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "server.deletion_retried", chi.URLParam(r, "id"), "", nil)
	respond(w, 202, map[string]string{"jobId": id})
}
func (a *API) serverDeletionConnection(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	var in control.DeletionConnectionInput
	if !decode(w, r, &in) {
		return
	}
	if e := a.Control.RepairDeletionConnection(r.Context(), chi.URLParam(r, "id"), in); e != nil {
		a.deletionError(w, e)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "server.deletion_connection_repaired", chi.URLParam(r, "id"), "", nil)
	respond(w, 200, map[string]bool{"ok": true})
}
func (a *API) deletionError(w http.ResponseWriter, e error) {
	if errors.Is(e, db.ErrConflict) || errors.Is(e, db.ErrDeleting) {
		fail(w, 409, e.Error())
		return
	}
	fail(w, 400, e.Error())
}
