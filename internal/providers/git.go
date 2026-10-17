package providers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"shipyard/internal/model"
)

type Repository struct {
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	DefaultBranch string `json:"default_branch"`
	Private       bool   `json:"private"`
}
type Branch struct {
	Name   string `json:"name"`
	Commit struct {
		SHA string `json:"sha"`
		ID  string `json:"id"`
	} `json:"commit"`
}
type GitProvider interface {
	Repositories(context.Context) ([]Repository, error)
	Branches(context.Context, string) ([]Branch, error)
	Checkout(context.Context, string, string, string) (string, error)
}
type GitClient struct {
	Config     model.Git
	Secrets    map[string]string
	HTTP       *http.Client
	API        string
	TokenFunc  func(context.Context) (string, error)
	AuthFailed func(context.Context)
}

func HTTPClient() *http.Client {
	return &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 3 {
			return errors.New("too many redirects")
		}
		if len(via) > 0 && (req.URL.Host != via[0].URL.Host || req.URL.Scheme != via[0].URL.Scheme) {
			return errors.New("cross-host redirect refused")
		}
		return nil
	}}
}
func NewGit(c model.Git, secrets map[string]string) *GitClient {
	base := "https://api.github.com"
	if c.Provider == "gitea" {
		base = strings.TrimRight(c.URL, "/") + "/api/v1"
	}
	return &GitClient{Config: c, Secrets: secrets, HTTP: HTTPClient(), API: base}
}
func (g *GitClient) Token(ctx context.Context) (string, error) {
	if g.TokenFunc != nil {
		return g.TokenFunc(ctx)
	}
	if g.Config.Status != "" && g.Config.Status != "ready" {
		return "", errors.New("Git connection requires authorization in Integrations")
	}
	if g.Config.Provider == "gitea" {
		if g.Secrets["token"] == "" {
			return "", errors.New("Gitea token is missing")
		}
		return g.Secrets["token"], nil
	}
	key, e := jwt.ParseRSAPrivateKeyFromPEM([]byte(g.Secrets["private_key"]))
	if e != nil {
		return "", errors.New("GitHub App RSA private key is invalid")
	}
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.RegisteredClaims{Issuer: g.Config.AppID, IssuedAt: jwt.NewNumericDate(now.Add(-time.Minute)), ExpiresAt: jwt.NewNumericDate(now.Add(8 * time.Minute))})
	signed, e := token.SignedString(key)
	if e != nil {
		return "", e
	}
	var response struct {
		Token string `json:"token"`
	}
	e = g.request(ctx, "POST", "/app/installations/"+url.PathEscape(g.Config.InstallationID)+"/access_tokens", signed, &response)
	if e != nil {
		return "", e
	}
	if response.Token == "" {
		return "", errors.New("GitHub did not return an installation token")
	}
	return response.Token, nil
}
func (g *GitClient) request(ctx context.Context, method, path, token string, out any) error {
	req, e := http.NewRequestWithContext(ctx, method, g.API+path, nil)
	if e != nil {
		return e
	}
	auth := "Bearer "
	if g.Config.Provider == "gitea" && g.Config.AuthMethod != "oauth" {
		auth = "token "
	}
	req.Header.Set("Authorization", auth+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	res, e := g.HTTP.Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		if res.StatusCode == http.StatusUnauthorized && g.AuthFailed != nil {
			g.AuthFailed(ctx)
			return errors.New("Gitea authorization expired or was revoked; reconnect in Integrations")
		}
		return fmt.Errorf("Git provider returned HTTP %d", res.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(res.Body, 8<<20)).Decode(out)
}
func (g *GitClient) Repositories(ctx context.Context) ([]Repository, error) {
	token, e := g.Token(ctx)
	if e != nil {
		return nil, e
	}
	out := []Repository{}
	for page := 1; page <= 100; page++ {
		var batch []Repository
		path := fmt.Sprintf("/user/repos?limit=100&page=%d", page)
		if g.Config.Provider == "github" {
			var wrapper struct {
				Repositories []Repository `json:"repositories"`
			}
			e = g.request(ctx, "GET", fmt.Sprintf("/installation/repositories?per_page=100&page=%d", page), token, &wrapper)
			batch = wrapper.Repositories
		} else {
			e = g.request(ctx, "GET", path, token, &batch)
		}
		if e != nil {
			return nil, e
		}
		out = append(out, batch...)
		if len(batch) < 100 {
			break
		}
	}
	return out, nil
}

var repoPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)

func (g *GitClient) Branches(ctx context.Context, repo string) ([]Branch, error) {
	if !repoPattern.MatchString(repo) {
		return nil, errors.New("repository must be owner/name")
	}
	token, e := g.Token(ctx)
	if e != nil {
		return nil, e
	}
	out := []Branch{}
	for page := 1; page <= 100; page++ {
		var batch []Branch
		e = g.request(ctx, "GET", fmt.Sprintf("/repos/%s/branches?per_page=100&limit=100&page=%d", repo, page), token, &batch)
		if e != nil {
			return nil, e
		}
		out = append(out, batch...)
		if len(batch) < 100 {
			break
		}
	}
	return out, nil
}
func (g *GitClient) Checkout(ctx context.Context, repo, ref, directory string) (string, error) {
	if !repoPattern.MatchString(repo) || ref == "" || strings.HasPrefix(ref, "-") || strings.ContainsAny(ref, "\x00\r\n") {
		return "", errors.New("invalid repository or ref")
	}
	token, e := g.Token(ctx)
	if e != nil {
		return "", e
	}
	base := "https://github.com"
	user := "x-access-token"
	if g.Config.Provider == "gitea" {
		base = strings.TrimRight(g.Config.URL, "/")
		user = "oauth2"
	}
	clone := base + "/" + repo + ".git"
	auth := base64.StdEncoding.EncodeToString([]byte(user + ":" + token))
	env := append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_CONFIG_COUNT=2", "GIT_CONFIG_KEY_0=http."+base+"/.extraheader", "GIT_CONFIG_VALUE_0=Authorization: Basic "+auth, "GIT_CONFIG_KEY_1=credential.helper", "GIT_CONFIG_VALUE_1=")
	if e = os.MkdirAll(directory, 0700); e != nil {
		return "", e
	}
	run := func(args ...string) (string, error) {
		c := exec.CommandContext(ctx, "git", args...)
		c.Dir = directory
		c.Env = env
		b, e := c.CombinedOutput()
		if e != nil {
			return "", fmt.Errorf("git %s failed: %s", args[0], strings.ReplaceAll(string(b), token, "[redacted]"))
		}
		return strings.TrimSpace(string(b)), nil
	}
	for _, args := range [][]string{{"init", "--quiet"}, {"remote", "add", "origin", clone}, {"fetch", "--quiet", "--depth=1", "origin", ref}, {"checkout", "--quiet", "--detach", "FETCH_HEAD"}} {
		if _, e = run(args...); e != nil {
			return "", e
		}
	}
	commit, e := run("rev-parse", "HEAD")
	if e != nil {
		return "", e
	}
	if !model.ValidSHA(commit) {
		return "", errors.New("invalid Git commit")
	}
	return commit, nil
}
func Archive(ctx context.Context, directory string, destination io.Writer) error {
	c := exec.CommandContext(ctx, "git", "archive", "--format=tar", "HEAD")
	c.Dir = filepath.Clean(directory)
	c.Stdout = destination
	var stderr bytes.Buffer
	c.Stderr = &stderr
	if e := c.Run(); e != nil {
		return fmt.Errorf("archive source: %w", e)
	}
	return nil
}
func VerifyWebhook(secret string, body []byte, signature string) bool {
	if secret == "" {
		return false
	}
	signature = strings.TrimPrefix(signature, "sha256=")
	b, e := hex.DecodeString(signature)
	if e != nil {
		return false
	}
	h := hmac.New(sha256.New, []byte(secret))
	h.Write(body)
	return hmac.Equal(b, h.Sum(nil))
}

type GitEvent struct {
	Repository string
	Branch     string
	SHA        string
	PR         int
	Action     string
	HeadRepo   string
	HeadBranch string
	HeadSHA    string
	Fork       bool
	UpdatedAt  time.Time
}

func ParseGitEvent(event string, body []byte) (GitEvent, error) {
	var p struct {
		Ref        string `json:"ref"`
		After      string `json:"after"`
		Action     string `json:"action"`
		Number     int    `json:"number"`
		Repository struct {
			FullName string `json:"full_name"`
		} `json:"repository"`
		PR struct {
			UpdatedAt time.Time `json:"updated_at"`
			Number    int       `json:"number"`
			Merged    bool      `json:"merged"`
			Head      struct {
				Ref  string `json:"ref"`
				SHA  string `json:"sha"`
				Repo struct {
					FullName string `json:"full_name"`
				} `json:"repo"`
			} `json:"head"`
		} `json:"pull_request"`
	}
	if e := json.Unmarshal(body, &p); e != nil {
		return GitEvent{}, e
	}
	v := GitEvent{Repository: p.Repository.FullName, Branch: strings.TrimPrefix(p.Ref, "refs/heads/"), SHA: p.After, Action: p.Action, PR: p.Number, HeadRepo: p.PR.Head.Repo.FullName, HeadBranch: p.PR.Head.Ref, HeadSHA: p.PR.Head.SHA}
	if v.PR == 0 {
		v.PR = p.PR.Number
	}
	v.Fork = v.HeadRepo != v.Repository
	v.UpdatedAt = p.PR.UpdatedAt
	if event == "push" {
		if !strings.HasPrefix(p.Ref, "refs/heads/") || strings.Trim(p.After, "0") == "" {
			return v, errors.New("not a branch push")
		}
		if !model.ValidSHA(v.SHA) {
			return v, errors.New("invalid push commit")
		}
	} else if event == "pull_request" {
		if v.PR < 1 || (!model.ValidSHA(v.HeadSHA) && v.Action != "closed") {
			return v, errors.New("invalid pull request")
		}
	} else {
		return v, errors.New("unsupported Git event")
	}
	return v, nil
}
