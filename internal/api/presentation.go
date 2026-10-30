package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	"image/png"
	"net/http"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
	"shipyard/internal/model"
)

const maxLogoBytes = 2 << 20

func normalizeLogo(raw []byte) ([]byte, error) {
	if len(raw) == 0 || len(raw) > maxLogoBytes {
		return nil, fmt.Errorf("logo must be no larger than 2 MiB")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || (format != "png" && format != "jpeg" && format != "webp") {
		return nil, fmt.Errorf("upload a PNG, JPEG, or WebP image")
	}
	if config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 16_000_000 {
		return nil, fmt.Errorf("logo must not exceed 16 megapixels")
	}
	source, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("invalid logo image")
	}
	w, h := config.Width, config.Height
	if w > 256 || h > 256 {
		if w >= h {
			h = max(1, h*256/w)
			w = 256
		} else {
			w = max(1, w*256/h)
			h = 256
		}
	}
	destination := image.NewNRGBA(image.Rect(0, 0, w, h))
	draw.CatmullRom.Scale(destination, destination.Bounds(), source, source.Bounds(), draw.Src, nil)
	var out bytes.Buffer
	if err = png.Encode(&out, destination); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func (a *API) resourceLogo(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, r.Method != http.MethodGet)
	if !ok {
		return
	}
	if v.Kind != "project" && v.Kind != "application" {
		fail(w, 400, "Only projects and applications support logos")
		return
	}
	if r.Method == http.MethodGet {
		var raw []byte
		var revision string
		if err := a.Store.Pool.QueryRow(r.Context(), "SELECT image,revision FROM resource_logos WHERE resource_id=$1", v.ID).Scan(&raw, &revision); err != nil {
			a.err(w, err)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "private, no-cache")
		w.Header().Set("ETag", `"`+revision+`"`)
		if r.Header.Get("If-None-Match") == `"`+revision+`"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Write(raw)
		return
	}
	if model.IsDeleting(v) {
		fail(w, 409, "Resource is being deleted")
		return
	}
	var normalized []byte
	var revision string
	if r.Method == http.MethodPut {
		var in struct {
			Image string `json:"image"`
		}
		if !decode(w, r, &in) {
			return
		}
		if len(in.Image) > base64.StdEncoding.EncodedLen(maxLogoBytes) {
			fail(w, 400, "Logo must be no larger than 2 MiB")
			return
		}
		raw, err := base64.StdEncoding.DecodeString(in.Image)
		if err != nil {
			fail(w, 400, "Invalid base64 image")
			return
		}
		normalized, err = normalizeLogo(raw)
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		revision = fmt.Sprintf("%x", sha256.Sum256(normalized))
	}
	if err := a.Store.SaveLogo(r.Context(), v.ID, revision, normalized); err != nil {
		a.err(w, err)
		return
	}
	a.resource(w, r)
}

func (a *API) moveResource(w http.ResponseWriter, r *http.Request) {
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	var in struct {
		BeforeID json.RawMessage `json:"beforeId"`
	}
	if !decode(w, r, &in) {
		return
	}
	var before *string
	if len(in.BeforeID) == 0 || json.Unmarshal(in.BeforeID, &before) != nil {
		fail(w, 400, "beforeId must be a card ID or null")
		return
	}
	if before != nil {
		anchor, err := a.Store.Resource(r.Context(), *before)
		if err != nil {
			a.err(w, err)
			return
		}
		if !a.Store.Access(r.Context(), user(r), anchor, false) {
			fail(w, 403, "You do not have access to this card")
			return
		}
	}
	if err := a.Store.MoveResource(r.Context(), v.ID, before); err != nil {
		a.err(w, err)
		return
	}
	a.resources(w, r)
}
