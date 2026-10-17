package api

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"io"
	"math/big"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

func testCertificateBundle(t *testing.T) []byte {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(42), Subject: pkix.Name{CommonName: "*.example.com", Organization: []string{"Test issuer"}},
		DNSNames:  []string{"*.example.com", "example.com"},
		NotBefore: time.Now().Add(-time.Hour).UTC().Truncate(time.Second), NotAfter: time.Now().Add(45 * 24 * time.Hour).UTC().Truncate(time.Second),
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, public, private)
	if err != nil {
		t.Fatal(err)
	}
	key, err := x509.MarshalPKCS8PrivateKey(private)
	if err != nil {
		t.Fatal(err)
	}
	bundle := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: key})
	return append(bundle, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})...)
}

func TestCertificateMetadata(t *testing.T) {
	var summary CertificateSummary
	if !certificateMetadata(&summary, testCertificateBundle(t)) {
		t.Fatal("valid certificate not parsed")
	}
	if !summary.HasCertificate || summary.SerialNumber != "2a" || len(summary.Names) != 2 || summary.ValidFrom == nil || summary.ExpiresAt == nil || summary.RenewalAt == nil || len(summary.Fingerprint) != 64 || !strings.Contains(summary.Issuer, "Test issuer") {
		t.Fatalf("incomplete public metadata: %+v", summary)
	}
	if summary.ExpiresAt.Sub(*summary.RenewalAt) != 30*24*time.Hour {
		t.Fatal("incorrect renewal window")
	}
	for _, invalid := range [][]byte{[]byte("invalid"), pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: []byte("invalid")}), pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: []byte("not a certificate")})} {
		if certificateMetadata(&CertificateSummary{}, invalid) {
			t.Fatal("invalid certificate accepted")
		}
	}
}

func TestZoneCertificatePermissionsAndPrivateKeyRedaction(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	save := func(kind, team, parent string, data any) model.Resource {
		t.Helper()
		b, _ := json.Marshal(data)
		r, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, TeamID: team, ParentID: parent, Data: b})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	team := save("team", "", "", map[string]any{})
	zone := save("zone", "", "", model.Zone{Domain: "example.com", ProviderZoneID: "example.com"})
	otherZone := save("zone", "", "", model.Zone{Domain: "other.com", ProviderZoneID: "other.com"})
	bundle := testCertificateBundle(t)
	routes := []model.Resource{}
	projects := []model.Resource{}
	for _, domain := range []string{"public.example.com", "private.example.com"} {
		project := save("project", team.ID, team.ID, map[string]any{})
		env := save("environment", team.ID, project.ID, map[string]any{})
		app := save("application", team.ID, env.ID, map[string]any{})
		route := save("route", team.ID, app.ID, model.Route{Domain: domain, ZoneID: zone.ID})
		sealed, err := a.Store.Vault.Seal(bundle, "certificate:"+route.ID)
		if err != nil {
			t.Fatal(err)
		}
		_, err = a.Store.Pool.Exec(ctx, `INSERT INTO domain_state(route_id,zone_id,domain,certificate_domain,certificate_state,certificate,expires_at,certificate_ca) VALUES($1,$2,$3,'*.example.com','renewal_failed',$4,now()+interval '45 days','https://acme.test/directory')`, route.ID, zone.ID, domain, sealed)
		if err != nil {
			t.Fatal(err)
		}
		routes = append(routes, route)
		projects = append(projects, project)
	}
	newSession := func(admin, member, assigned bool) string {
		t.Helper()
		id, token := uuid.NewString(), secure.Token()
		_, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'test','disabled',$3)", id, id+"@test.invalid", admin)
		if err != nil {
			t.Fatal(err)
		}
		_, err = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id)
		if err != nil {
			t.Fatal(err)
		}
		if member {
			_, err = a.Store.Pool.Exec(ctx, "INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,'member')", team.ID, id)
			if err != nil {
				t.Fatal(err)
			}
		}
		if assigned {
			_, err = a.Store.Pool.Exec(ctx, "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'viewer')", projects[0].ID, id)
			if err != nil {
				t.Fatal(err)
			}
		}
		return token
	}
	_, err := a.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", zone.ID, team.ID)
	if err != nil {
		t.Fatal(err)
	}
	admin := newSession(true, false, false)
	viewer := newSession(false, true, true)
	unassigned := newSession(false, true, false)
	outsider := newSession(false, false, false)
	for _, tc := range []struct {
		name, token, zone string
		count, status     int
	}{
		{"admin", admin, zone.ID, 2, 200},
		{"assigned viewer", viewer, zone.ID, 1, 200},
		{"zone grant without project", unassigned, zone.ID, 0, 200},
		{"no zone grant", outsider, zone.ID, 0, 403},
		{"different zone", viewer, otherZone.ID, 0, 403},
		{"empty zone", admin, otherZone.ID, 0, 200},
		{"wrong resource kind", admin, team.ID, 0, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := http.NewRequest("GET", server.URL+"/api/v1/zones/"+tc.zone+"/certificates", nil)
			req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: tc.token})
			res, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			body, _ := io.ReadAll(res.Body)
			if res.StatusCode != tc.status {
				t.Fatalf("status %d: %s", res.StatusCode, body)
			}
			if bytes.Contains(body, []byte("PRIVATE KEY")) || bytes.Contains(body, []byte("BEGIN CERTIFICATE")) {
				t.Fatal("certificate bundle exposed")
			}
			if tc.status != 200 {
				return
			}
			var got []CertificateSummary
			if err := json.Unmarshal(body, &got); err != nil {
				t.Fatal(err)
			}
			if len(got) != tc.count {
				t.Fatalf("wanted %d certificates, got %d", tc.count, len(got))
			}
			for _, cert := range got {
				if !cert.HasCertificate || cert.ExpiresAt == nil || cert.Status != "renewal_failed" || cert.SerialNumber != "2a" {
					t.Fatalf("metadata missing: %+v", cert)
				}
				if tc.token == viewer && cert.RouteID != routes[0].ID {
					t.Fatal("another project's certificate exposed")
				}
			}
		})
	}
}

func TestServerPasswordRemainsEncryptedAndWriteOnly(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	id, token := uuid.NewString(), secure.Token()
	_, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'admin','disabled',true)", id, id+"@test.invalid")
	if err != nil {
		t.Fatal(err)
	}
	_, err = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id)
	if err != nil {
		t.Fatal(err)
	}
	password := "test-only-ssh-password"
	body := `{"kind":"server","name":"Password host","data":{"host":"server.test","port":22,"user":"root","fingerprint":"SHA256:verified","authMethod":"password"},"secrets":{"password":"` + password + `"}}`
	req, _ := http.NewRequest("POST", server.URL+"/api/v1/resources", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://shipyard.test")
	req.Header.Set("X-CSRF-Token", "csrf")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 && res.StatusCode != 201 {
		t.Fatalf("save failed %d: %s", res.StatusCode, raw)
	}
	if bytes.Contains(raw, []byte(password)) {
		t.Fatal("password returned in API response")
	}
	var saved model.Resource
	if err := json.Unmarshal(raw, &saved); err != nil {
		t.Fatal(err)
	}
	stored, err := a.Store.Resource(ctx, saved.ID)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(stored.Secret, []byte(password)) || bytes.Contains(stored.Data, []byte(password)) {
		t.Fatal("plaintext SSH password persisted")
	}
	secrets, err := a.Store.Secrets(stored)
	if err != nil || secrets["password"] != password {
		t.Fatal("SSH password could not be decrypted")
	}
}
