package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pquerna/otp/totp"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

type contextKey int

const userKey contextKey = 1

func user(r *http.Request) model.User { u, _ := r.Context().Value(userKey).(model.User); return u }

// Streams outlive the request middleware. Reload both session and user role so
// logout, expiry, and administrator demotion also revoke existing connections.
func (a *API) streamAccess(r *http.Request, resource model.Resource, write bool) bool {
	current, lookupErr := a.Store.Resource(r.Context(), resource.ID)
	if lookupErr != nil || (write && model.IsDeleting(current)) {
		return false
	}
	cookie, err := r.Cookie("shipyard_session")
	if err != nil {
		return false
	}
	var u model.User
	err = a.Store.Pool.QueryRow(r.Context(), `SELECT u.id,u.admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>now() AND NOT u.disabled`, secure.Hash(cookie.Value)).Scan(&u.ID, &u.Admin)
	return err == nil && a.Store.Access(r.Context(), u, resource, write)
}
func (a *API) require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, e := r.Cookie("shipyard_session")
		if e != nil {
			fail(w, 401, "Sign in to continue")
			return
		}
		var u model.User
		var csrf string
		e = a.Store.Pool.QueryRow(r.Context(), `SELECT u.id,u.email,u.name,u.admin,u.totp IS NOT NULL,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>now() AND NOT u.disabled`, secure.Hash(cookie.Value)).Scan(&u.ID, &u.Email, &u.Name, &u.Admin, &u.TOTP, &csrf)
		if e != nil {
			fail(w, 401, "Session expired")
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" && !secure.Equal(csrf, r.Header.Get("X-CSRF-Token")) {
			fail(w, 403, "Invalid CSRF token")
			return
		}
		ctx := context.WithValue(r.Context(), userKey, u)
		ctx = context.WithValue(ctx, contextKey(2), csrf)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type loginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Code     string `json:"code"`
	Token    string `json:"token"`
}
type attempt struct {
	count int
	reset time.Time
}
type limiter struct {
	mu     sync.Mutex
	values map[string]attempt
}

func (l *limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.values == nil {
		l.values = map[string]attempt{}
	}
	now := time.Now()
	if len(l.values) > 10000 {
		for k, v := range l.values {
			if now.After(v.reset) {
				delete(l.values, k)
			}
		}
		if len(l.values) > 10000 {
			return false
		}
	}
	v := l.values[key]
	if now.After(v.reset) {
		v = attempt{reset: now.Add(15 * time.Minute)}
	}
	v.count++
	l.values[key] = v
	return v.count <= 15
}
func (a *API) status(w http.ResponseWriter, r *http.Request) {
	var count int
	if e := a.Store.Pool.QueryRow(r.Context(), "SELECT count(*) FROM users").Scan(&count); e != nil {
		fail(w, 503, "Database unavailable")
		return
	}
	respond(w, 200, map[string]any{"setupRequired": count == 0, "setupEnabled": a.BootstrapToken != ""})
}
func normalizeEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
func validEmail(s string) bool {
	return strings.Count(s, "@") == 1 && len(s) <= 254 && !strings.ContainsAny(s, " \r\n\x00") && strings.Contains(strings.SplitN(s, "@", 2)[1], ".")
}
func (a *API) setup(w http.ResponseWriter, r *http.Request) {
	var in loginInput
	if !decode(w, r, &in) {
		return
	}
	if a.BootstrapToken == "" || !secure.Equal(in.Token, a.BootstrapToken) {
		fail(w, 403, "Invalid bootstrap token")
		return
	}
	in.Email = normalizeEmail(in.Email)
	if !validEmail(in.Email) || strings.TrimSpace(in.Name) == "" {
		fail(w, 400, "Valid email and name required")
		return
	}
	password, e := secure.Password(in.Password)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	tx, e := a.Store.Pool.Begin(r.Context())
	if e != nil {
		a.err(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	_, e = tx.Exec(r.Context(), "SELECT pg_advisory_xact_lock(73914230)")
	if e != nil {
		a.err(w, e)
		return
	}
	var count int
	_ = tx.QueryRow(r.Context(), "SELECT count(*) FROM users").Scan(&count)
	if count != 0 {
		fail(w, 409, "Shipyard has already been initialized")
		return
	}
	id := uuid.NewString()
	_, e = tx.Exec(r.Context(), "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,$3,$4,true)", id, in.Email, in.Name, password)
	if e != nil {
		a.err(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		a.err(w, e)
		return
	}
	a.newSession(w, r, model.User{ID: id, Email: in.Email, Name: in.Name, Admin: true})
}
func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var in loginInput
	if !decode(w, r, &in) {
		return
	}
	in.Email = normalizeEmail(in.Email)
	if !a.limits.Allow(secure.Hash(clientIP(r) + in.Email)) {
		fail(w, 429, "Too many sign-in attempts; try again in 15 minutes")
		return
	}
	var u model.User
	var password string
	var encrypted []byte
	e := a.Store.Pool.QueryRow(r.Context(), "SELECT id,email,name,admin,password,totp FROM users WHERE email=$1 AND NOT disabled", in.Email).Scan(&u.ID, &u.Email, &u.Name, &u.Admin, &password, &encrypted)
	if e != nil || !secure.CheckPassword(in.Password, password) {
		fail(w, 401, "Invalid email or password")
		return
	}
	if len(encrypted) > 0 {
		u.TOTP = true
		if !a.validateOTP(r.Context(), u.ID, encrypted, in.Code) {
			fail(w, 401, "Authenticator or recovery code required")
			return
		}
	}
	a.newSession(w, r, u)
}
func (a *API) validateOTP(ctx context.Context, id string, encrypted []byte, code string) bool {
	raw, e := a.Store.Vault.Open(encrypted, "totp:"+id)
	if e == nil && totp.Validate(code, string(raw)) {
		return true
	}
	if code == "" {
		return false
	}
	tag, e := a.Store.Pool.Exec(ctx, "UPDATE users SET recovery=array_remove(recovery,$2) WHERE id=$1 AND $2=ANY(recovery)", id, secure.Hash(code))
	return e == nil && tag.RowsAffected() == 1
}
func (a *API) newSession(w http.ResponseWriter, r *http.Request, u model.User) {
	token, csrf := secure.Token(), secure.Token()
	_, e := a.Store.Pool.Exec(r.Context(), "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '7 days')", secure.Hash(token), u.ID, csrf)
	if e != nil {
		a.err(w, e)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "shipyard_session", Value: token, Path: "/", HttpOnly: true, Secure: strings.HasPrefix(a.requestOrigin(r), "https://"), SameSite: http.SameSiteLaxMode, MaxAge: 7 * 86400})
	respond(w, 200, map[string]any{"user": u, "csrf": csrf, "maintenance": a.Store.Maintenance(r.Context())})
}
func (a *API) me(w http.ResponseWriter, r *http.Request) {
	respond(w, 200, map[string]any{"user": user(r), "csrf": r.Context().Value(contextKey(2)), "maintenance": a.Store.Maintenance(r.Context())})
}
func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	cookie, _ := r.Cookie("shipyard_session")
	if cookie != nil {
		_, _ = a.Store.Pool.Exec(r.Context(), "DELETE FROM sessions WHERE token=$1", secure.Hash(cookie.Value))
	}
	http.SetCookie(w, &http.Cookie{Name: "shipyard_session", Value: "", Path: "/", HttpOnly: true, Secure: strings.HasPrefix(a.requestOrigin(r), "https://"), SameSite: http.SameSiteStrictMode, MaxAge: -1})
	respond(w, 200, map[string]bool{"ok": true})
}
func (a *API) totpStart(w http.ResponseWriter, r *http.Request) {
	var in loginInput
	if !decode(w, r, &in) {
		return
	}
	u := user(r)
	var password string
	_ = a.Store.Pool.QueryRow(r.Context(), "SELECT password FROM users WHERE id=$1", u.ID).Scan(&password)
	if !secure.CheckPassword(in.Password, password) {
		fail(w, 403, "Current password required")
		return
	}
	if u.TOTP {
		fail(w, 409, "Disable your current authenticator before replacing it")
		return
	}
	key, e := totp.Generate(totp.GenerateOpts{Issuer: "Shipyard", AccountName: u.Email})
	if e != nil {
		a.err(w, e)
		return
	}
	sealed, e := a.Store.Vault.Seal([]byte(key.Secret()), "totp:"+u.ID)
	if e != nil {
		a.err(w, e)
		return
	}
	_, e = a.Store.Pool.Exec(r.Context(), "UPDATE users SET pending_totp=$2 WHERE id=$1", u.ID, sealed)
	if e != nil {
		a.err(w, e)
		return
	}
	respond(w, 200, map[string]string{"secret": key.Secret(), "url": key.URL()})
}
func (a *API) totpConfirm(w http.ResponseWriter, r *http.Request) {
	var in loginInput
	if !decode(w, r, &in) {
		return
	}
	u := user(r)
	var pending []byte
	e := a.Store.Pool.QueryRow(r.Context(), "SELECT pending_totp FROM users WHERE id=$1", u.ID).Scan(&pending)
	if e != nil || len(pending) == 0 {
		fail(w, 400, "Start authenticator setup first")
		return
	}
	secret, e := a.Store.Vault.Open(pending, "totp:"+u.ID)
	if e != nil || !totp.Validate(in.Code, string(secret)) {
		fail(w, 400, "Invalid authenticator code")
		return
	}
	codes := []string{}
	hashes := []string{}
	for i := 0; i < 10; i++ {
		v := secure.Token()[:16]
		codes = append(codes, v)
		hashes = append(hashes, secure.Hash(v))
	}
	_, e = a.Store.Pool.Exec(r.Context(), "UPDATE users SET totp=pending_totp,pending_totp=NULL,recovery=$2 WHERE id=$1", u.ID, hashes)
	if e != nil {
		a.err(w, e)
		return
	}
	_ = a.Store.Audit(r.Context(), u.ID, "account.totp_enabled", u.ID, "", nil)
	respond(w, 200, map[string]any{"recoveryCodes": codes})
}
func (a *API) totpDisable(w http.ResponseWriter, r *http.Request) {
	var in loginInput
	if !decode(w, r, &in) {
		return
	}
	u := user(r)
	var password string
	var encrypted []byte
	e := a.Store.Pool.QueryRow(r.Context(), "SELECT password,totp FROM users WHERE id=$1", u.ID).Scan(&password, &encrypted)
	if e != nil || !secure.CheckPassword(in.Password, password) || !a.validateOTP(r.Context(), u.ID, encrypted, in.Code) {
		fail(w, 403, "Current password and authenticator/recovery code required")
		return
	}
	_, e = a.Store.Pool.Exec(r.Context(), "UPDATE users SET totp=NULL,pending_totp=NULL,recovery='{}' WHERE id=$1", u.ID)
	if e != nil {
		a.err(w, e)
		return
	}
	respond(w, 200, map[string]bool{"ok": true})
}
func (a *API) accept(w http.ResponseWriter, r *http.Request) {
	var in loginInput
	if !decode(w, r, &in) {
		return
	}
	if !a.limits.Allow(secure.Hash(clientIP(r) + in.Token)) {
		fail(w, 429, "Too many attempts")
		return
	}
	var email, team, project, role string
	e := a.Store.Pool.QueryRow(r.Context(), "SELECT email,team_id,project_id,role FROM invitations WHERE token=$1 AND expires_at>now()", secure.Hash(in.Token)).Scan(&email, &team, &project, &role)
	if e != nil {
		fail(w, 400, "Invitation is invalid or expired")
		return
	}
	var u model.User
	var encoded string
	var otp []byte
	var disabled bool
	e = a.Store.Pool.QueryRow(r.Context(), "SELECT id,email,name,admin,password,totp,disabled FROM users WHERE email=$1", email).Scan(&u.ID, &u.Email, &u.Name, &u.Admin, &encoded, &otp, &disabled)
	existing := e == nil
	if existing {
		u.TOTP = len(otp) > 0
		if disabled {
			fail(w, 403, "Account is disabled; contact a platform administrator")
			return
		}
		if !secure.CheckPassword(in.Password, encoded) || len(otp) > 0 && !a.validateOTP(r.Context(), u.ID, otp, in.Code) {
			fail(w, 403, "Use your existing account password and authenticator code")
			return
		}
	} else if !errors.Is(e, pgx.ErrNoRows) {
		a.err(w, e)
		return
	} else {
		encoded, e = secure.Password(in.Password)
		if e != nil {
			fail(w, 400, e.Error())
			return
		}
		u = model.User{ID: uuid.NewString(), Email: email, Name: in.Name}
		if strings.TrimSpace(u.Name) == "" {
			fail(w, 400, "Name required")
			return
		}
	}
	tx, e := a.Store.Pool.Begin(r.Context())
	if e != nil {
		a.err(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var claimed string
	e = tx.QueryRow(r.Context(), "DELETE FROM invitations WHERE token=$1 AND expires_at>now() RETURNING id", secure.Hash(in.Token)).Scan(&claimed)
	if e != nil {
		fail(w, 409, "Invitation was already used")
		return
	}
	if !existing {
		if _, e = tx.Exec(r.Context(), "INSERT INTO users(id,email,name,password) VALUES($1,$2,$3,$4)", u.ID, u.Email, u.Name, encoded); e != nil {
			a.err(w, e)
			return
		}
	}
	teamRole := "member"
	if project == "" && role == "owner" {
		teamRole = "owner"
	}
	if _, e = tx.Exec(r.Context(), "INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(team_id,user_id) DO UPDATE SET role=CASE WHEN team_members.role='owner' THEN 'owner' ELSE EXCLUDED.role END", team, u.ID, teamRole); e != nil {
		a.err(w, e)
		return
	}
	if project != "" {
		if _, e = tx.Exec(r.Context(), "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(project_id,user_id) DO UPDATE SET role=$3", project, u.ID, role); e != nil {
			a.err(w, e)
			return
		}
	}
	if e = tx.Commit(r.Context()); e != nil {
		a.err(w, e)
		return
	}
	a.newSession(w, r, u)
}
func jsonBytes(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
