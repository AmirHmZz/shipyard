package providers

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"github.com/golang-jwt/jwt/v5"
	"net/http"
	"net/http/httptest"
	"shipyard/internal/model"
	"strings"
	"testing"
)

func TestGitHubAppInstallationAndRepositorySelection(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "access_tokens") {
			token, err := jwt.Parse(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), func(token *jwt.Token) (any, error) { return &key.PublicKey, nil }, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer("100"))
			if err != nil || !token.Valid {
				t.Error("invalid GitHub App JWT", err)
				http.Error(w, "unauthorized", 401)
				return
			}
			w.Write([]byte(`{"token":"installation-token"}`))
			return
		}
		if r.Header.Get("Authorization") != "Bearer installation-token" {
			t.Error("repository request did not use installation token")
		}
		if strings.Contains(r.URL.Path, "branches") {
			w.Write([]byte(`[{"name":"main","commit":{"sha":"abc"}}]`))
			return
		}
		w.Write([]byte(`{"repositories":[{"name":"web","full_name":"owner/web","default_branch":"main","private":true}]}`))
	}))
	defer server.Close()
	git := NewGit(model.Git{Provider: "github", AppID: "100", InstallationID: "7"}, map[string]string{"private_key": string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))})
	git.API = server.URL
	repos, err := git.Repositories(context.Background())
	if err != nil || len(repos) != 1 || repos[0].FullName != "owner/web" {
		t.Fatal(repos, err)
	}
	branches, err := git.Branches(context.Background(), "owner/web")
	if err != nil || len(branches) != 1 || branches[0].Name != "main" {
		t.Fatal(branches, err)
	}
	if _, err = git.Branches(context.Background(), "../../other"); err == nil {
		t.Fatal("repository path injection accepted")
	}
}

func TestGiteaRepositoryAPIUsesTokenAndInstance(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/user/repos" || r.Header.Get("Authorization") != "token gitea-token" {
			t.Error("incorrect Gitea API request", r.URL.Path)
		}
		w.Write([]byte(`[{"name":"web","full_name":"team/web","default_branch":"trunk"}]`))
	}))
	defer server.Close()
	git := NewGit(model.Git{Provider: "gitea", URL: server.URL}, map[string]string{"token": "gitea-token"})
	repos, err := git.Repositories(context.Background())
	if err != nil || len(repos) != 1 || repos[0].DefaultBranch != "trunk" {
		t.Fatal(repos, err)
	}
}
