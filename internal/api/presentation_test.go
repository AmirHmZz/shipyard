package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"strings"
	"testing"

	"shipyard/internal/model"
	"shipyard/internal/secure"
)

func TestNormalizeLogo(t *testing.T) {
	webp, err := base64.StdEncoding.DecodeString("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = normalizeLogo(webp); err != nil {
		t.Fatal("WebP upload rejected", err)
	}
	for _, format := range []string{"png", "jpeg"} {
		t.Run(format, func(t *testing.T) {
			var raw bytes.Buffer
			source := image.NewNRGBA(image.Rect(0, 0, 600, 300))
			var err error
			if format == "png" {
				err = png.Encode(&raw, source)
			} else {
				err = jpeg.Encode(&raw, source, nil)
			}
			if err != nil {
				t.Fatal(err)
			}
			out, err := normalizeLogo(raw.Bytes())
			if err != nil {
				t.Fatal(err)
			}
			config, name, err := image.DecodeConfig(bytes.NewReader(out))
			if err != nil || name != "png" || config.Width != 256 || config.Height != 128 {
				t.Fatal(config, name, err)
			}
		})
	}
	for _, raw := range [][]byte{nil, []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`), []byte("not an image"), make([]byte, maxLogoBytes+1)} {
		if _, err := normalizeLogo(raw); err == nil {
			t.Fatal("invalid logo accepted")
		}
	}
	var large bytes.Buffer
	if err := png.Encode(&large, image.NewNRGBA(image.Rect(0, 0, 4001, 4000))); err != nil {
		t.Fatal(err)
	}
	if _, err := normalizeLogo(large.Bytes()); err == nil {
		t.Fatal("oversized dimensions accepted")
	}
}

func TestResourcePresentationAPI(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	for _, name := range []string{"admin", "viewer", "operator", "outsider"} {
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$1||'@presentation.test',$1,'disabled',$2)", name, name == "admin"); err != nil {
			t.Fatal(err)
		}
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(name), name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := a.Store.Pool.Exec(ctx, `INSERT INTO resources(id,kind,name,team_id,parent_id,data) VALUES
	('team','team','Team','','','{}'),('p','project','Project','team','team','{}'),('other','project','Other','team','team','{}'),
	('env','environment','Production','team','p','{}'),('app','application','App','team','env','{}'),('app2','application','App2','team','env','{}'),
	('env2','environment','Staging','team','p','{}'),('app3','application','App3','team','env2','{}');
	INSERT INTO project_members(project_id,user_id,role) VALUES('p','viewer','viewer'),('p','operator','operator')`); err != nil {
		t.Fatal(err)
	}
	request := func(method, path, body, account string, status int) []byte {
		t.Helper()
		req, _ := http.NewRequest(method, server.URL+"/api/v1/resources/"+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: account})
		req.Header.Set("X-CSRF-Token", "csrf")
		req.Header.Set("Origin", a.Origin)
		req.Header.Set("Content-Type", "application/json")
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		if res.StatusCode != status {
			t.Fatalf("%s %s: %d %s", method, path, res.StatusCode, raw)
		}
		return raw
	}
	var logo bytes.Buffer
	if err := png.Encode(&logo, image.NewNRGBA(image.Rect(0, 0, 4, 2))); err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]string{"image": base64.StdEncoding.EncodeToString(logo.Bytes())})
	before, _ := a.Store.Resource(ctx, "app")
	request("PUT", "app/logo", string(payload), "viewer", 403)
	request("GET", "app/logo", "", "outsider", 403)
	request("PUT", "env/logo", string(payload), "admin", 400)
	request("PUT", "app/logo", `{"image":"invalid"}`, "admin", 400)
	for _, id := range []string{"p", "app"} {
		var saved model.Resource
		if err := json.Unmarshal(request("PUT", id+"/logo", string(payload), "operator", 200), &saved); err != nil || saved.LogoURL == nil {
			t.Fatal(saved, err)
		}
		if got := request("GET", id+"/logo", "", "viewer", 200); !bytes.Equal(got, logo.Bytes()) {
			t.Fatal("logo did not round-trip")
		}
		request("PUT", id+"/logo", string(payload), "operator", 200)
		request("DELETE", id+"/logo", "", "operator", 200)
		request("GET", id+"/logo", "", "viewer", 404)
	}
	request("POST", "app2/move", `{"beforeId":"app"}`, "viewer", 403)
	request("POST", "app2/move", `{}`, "operator", 400)
	request("POST", "app2/move", `{"beforeId":42}`, "operator", 400)
	request("POST", "app2/move", `{"beforeId":"app3"}`, "operator", 409)
	request("POST", "app2/move", `{"beforeId":"missing"}`, "operator", 404)
	request("POST", "app2/move", `{"beforeId":"app"}`, "operator", 200)
	after, _ := a.Store.Resource(ctx, "app")
	if before.Version != after.Version || !bytes.Equal(before.Data, after.Data) {
		t.Fatal("presentation changed deployment settings")
	}
	if _, err := a.Store.Pool.Exec(ctx, `UPDATE resources SET data='{"deleting":true}' WHERE id='p'`); err != nil {
		t.Fatal(err)
	}
	request("PUT", "app/logo", string(payload), "admin", 409)
	request("DELETE", "app/logo", "", "admin", 409)
	request("POST", "app2/move", `{"beforeId":null}`, "admin", 409)
}
