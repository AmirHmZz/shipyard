package api

import (
	"bytes"
	"github.com/go-chi/chi/v5"
	"net/http"
	"shipyard/internal/platformupdate"
	"shipyard/internal/release"
	"shipyard/internal/remote"
)

func (a *API) updates(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if a.Updates == nil {
		respond(w, 200, platformupdate.Status{Reason: "System updates require the release installer"})
		return
	}
	state, e := a.Updates.Status(r.Context())
	if e != nil {
		a.err(w, e)
		return
	}
	respond(w, 200, state)
}
func (a *API) checkUpdates(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if a.Updates == nil {
		fail(w, 400, "System updates require the release installer")
		return
	}
	state, e := a.Updates.Check(r.Context())
	if e != nil {
		fail(w, 502, e.Error())
		return
	}
	respond(w, 200, state)
}
func (a *API) planUpdate(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if a.Updates == nil {
		fail(w, 400, "System updates are unavailable")
		return
	}
	var in struct {
		Target string `json:"target"`
	}
	if !decode(w, r, &in) {
		return
	}
	plan, e := a.Updates.Prepare(r.Context(), in.Target, user(r).ID)
	if e != nil {
		fail(w, 409, e.Error())
		return
	}
	respond(w, 200, plan)
}
func (a *API) executeUpdate(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if a.Updates == nil {
		fail(w, 400, "System updates are unavailable")
		return
	}
	var in struct {
		PlanID          string `json:"planId"`
		Passphrase      string `json:"passphrase"`
		Confirmation    string `json:"confirmation"`
		ApproveDataLoss bool   `json:"approveDataLoss"`
	}
	if !decode(w, r, &in) {
		return
	}
	operation, e := a.Updates.Execute(r.Context(), in.PlanID, user(r).ID, in.Passphrase, in.Confirmation, in.ApproveDataLoss)
	if e != nil {
		fail(w, 409, e.Error())
		return
	}
	respond(w, 202, operation)
}
func (a *API) updateOperation(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if a.Updates == nil {
		fail(w, 404, "Operation unavailable")
		return
	}
	o, e := a.Updates.Operation(r.Context(), chi.URLParam(r, "id"))
	if e != nil {
		a.err(w, e)
		return
	}
	id := chi.URLParam(r, "id")
	if id != o.ID {
		fail(w, 404, "Operation not found")
		return
	}
	respond(w, 200, o.Public())
}
func (a *API) updateBackup(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if a.Updates == nil {
		fail(w, 404, "Backup unavailable")
		return
	}
	o, e := a.Updates.Operation(r.Context(), chi.URLParam(r, "id"))
	if e != nil {
		a.err(w, e)
		return
	}
	id := chi.URLParam(r, "id")
	path, e := platformupdate.BackupPath(id)
	if e != nil || id != o.ID || o.Backup == "" {
		fail(w, 404, "Backup not found")
		return
	}
	if a.Control == nil || a.Control.Local == nil {
		fail(w, 503, "Encrypted backups require access to the native installation host")
		return
	}
	var content, stderr bytes.Buffer
	if e = a.Control.Local.RunSeparated(r.Context(), remote.Command("cat", path), nil, &content, &stderr); e != nil {
		fail(w, 503, "Encrypted backup is unavailable on the installation host")
		return
	}
	if release.Hash(content.Bytes()) != o.BackupHash {
		fail(w, 503, "Encrypted backup integrity check failed")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=shipyard-"+id+".sybackup")
	_, _ = w.Write(content.Bytes())
}
