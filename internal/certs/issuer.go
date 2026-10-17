package certs

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"time"

	"github.com/go-acme/lego/v4/certificate"
	"github.com/go-acme/lego/v4/lego"
	"github.com/go-acme/lego/v4/providers/dns/arvancloud"
	"github.com/go-acme/lego/v4/providers/dns/cloudflare"
	"github.com/go-acme/lego/v4/registration"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/providers"
	"shipyard/internal/secure"
)

type Issuer interface {
	Obtain(context.Context, string, string, string) ([]byte, time.Time, error)
}
type ACME struct {
	Store     *db.Store
	Email     string
	Directory string
	AcceptTOS bool
}
type Configuration struct {
	Email     string `json:"email"`
	AcceptTOS bool   `json:"acceptTos"`
}

func (c Configuration) Validate() error {
	parsed, e := mail.ParseAddress(c.Email)
	if (c.Email != "" && (e != nil || parsed.Address != c.Email || strings.ContainsAny(c.Email, "\r\n"))) || !c.AcceptTOS {
		return errors.New("accept the Let's Encrypt terms and provide a valid contact email if used")
	}
	return nil
}
func (a *ACME) Configuration(ctx context.Context) (Configuration, error) {
	c := Configuration{a.Email, a.AcceptTOS}
	if c.Email != "" && c.AcceptTOS {
		return c, nil
	}
	var raw []byte
	e := a.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key='acme-config'").Scan(&raw)
	if errors.Is(e, pgx.ErrNoRows) {
		return c, nil
	}
	if e != nil {
		return c, e
	}
	var saved Configuration
	if e = json.Unmarshal(raw, &saved); e != nil {
		return c, e
	}
	if c.Email == "" {
		c.Email = saved.Email
	}
	if !c.AcceptTOS {
		c.AcceptTOS = saved.AcceptTOS
	}
	return c, nil
}

type account struct {
	Email        string                 `json:"email"`
	Registration *registration.Resource `json:"registration"`
	Key          []byte                 `json:"key"`
	private      crypto.PrivateKey
}

func (a *account) GetEmail() string                        { return a.Email }
func (a *account) GetRegistration() *registration.Resource { return a.Registration }
func (a *account) GetPrivateKey() crypto.PrivateKey        { return a.private }
func (a *ACME) DirectoryURL() string {
	if a.Directory != "" {
		return a.Directory
	}
	return "https://acme-v02.api.letsencrypt.org/directory"
}
func (original *ACME) Obtain(ctx context.Context, domain, provider, token string) ([]byte, time.Time, error) {
	return original.obtain(ctx, domain, provider, token, false)
}
func (original *ACME) ObtainHTTP(ctx context.Context, domain string) ([]byte, time.Time, error) {
	return original.obtain(ctx, domain, "", "", true)
}
func (original *ACME) obtain(ctx context.Context, domain, provider, token string, httpChallenge bool) ([]byte, time.Time, error) {
	resolved := *original
	a := &resolved
	configuration, err := a.Configuration(ctx)
	if err != nil {
		return nil, time.Time{}, err
	}
	a.Email = configuration.Email
	a.AcceptTOS = configuration.AcceptTOS
	if !a.AcceptTOS {
		return nil, time.Time{}, errors.New("configure certificate email and terms under Settings → Dashboard access, or set SHIPYARD_ACME_EMAIL and SHIPYARD_ACME_ACCEPT_TOS=true")
	}
	conn, err := a.Store.Pool.Acquire(ctx)
	if err != nil {
		return nil, time.Time{}, err
	}
	defer conn.Release()
	if _, err = conn.Exec(ctx, "SELECT pg_advisory_lock(73914229)"); err != nil {
		return nil, time.Time{}, err
	}
	defer conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock(73914229)")
	user := account{Email: a.Email}
	directory := a.DirectoryURL()
	accountKey := "acme-account:" + secure.Hash(directory+"|"+a.Email)
	var encrypted string
	_ = conn.QueryRow(ctx, "SELECT value::text FROM settings WHERE key=$1", accountKey).Scan(&encrypted)
	if encrypted != "" {
		var raw []byte
		if err = json.Unmarshal([]byte(encrypted), &raw); err != nil {
			return nil, time.Time{}, err
		}
		raw, err = a.Store.Vault.Open(raw, accountKey)
		if err != nil {
			return nil, time.Time{}, err
		}
		if err = json.Unmarshal(raw, &user); err != nil {
			return nil, time.Time{}, err
		}
		user.private, err = x509.ParsePKCS1PrivateKey(user.Key)
		if err != nil {
			return nil, time.Time{}, err
		}
	} else {
		key, e := rsa.GenerateKey(rand.Reader, 2048)
		if e != nil {
			return nil, time.Time{}, e
		}
		user.private = key
		user.Key = x509.MarshalPKCS1PrivateKey(key)
	}
	config := lego.NewConfig(&user)
	base := config.HTTPClient.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	config.HTTPClient.Transport = contextTransport{ctx, base}
	if a.Directory != "" {
		config.CADirURL = a.Directory
	}
	client, err := lego.NewClient(config)
	if err != nil {
		return nil, time.Time{}, err
	}
	if user.Registration == nil {
		user.Registration, err = client.Registration.Register(registration.RegisterOptions{TermsOfServiceAgreed: true})
		if err != nil {
			return nil, time.Time{}, err
		}
		raw, _ := json.Marshal(user)
		raw, err = a.Store.Vault.Seal(raw, accountKey)
		if err != nil {
			return nil, time.Time{}, err
		}
		value, _ := json.Marshal(raw)
		_, err = conn.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", accountKey, value)
		if err != nil {
			return nil, time.Time{}, err
		}
	}
	// Configure instances directly; process-global environment variables would mix tenant credentials.
	if httpChallenge {
		err = client.Challenge.SetHTTP01Provider(&httpProvider{Store: a.Store, Context: ctx})
	} else {
		switch provider {
		case "cloudflare":
			cfg := cloudflare.NewDefaultConfig()
			cfg.AuthToken = token
			p, e := cloudflare.NewDNSProviderConfig(cfg)
			if e != nil {
				return nil, time.Time{}, e
			}
			err = client.Challenge.SetDNS01Provider(p)
		case "arvancloud":
			cfg := arvancloud.NewDefaultConfig()
			cfg.APIKey = providers.ArvanAuthorization(token)
			p, e := arvancloud.NewDNSProviderConfig(cfg)
			if e != nil {
				return nil, time.Time{}, e
			}
			err = client.Challenge.SetDNS01Provider(p)
		default:
			return nil, time.Time{}, errors.New("unsupported certificate DNS provider")
		}
	}
	if err != nil {
		return nil, time.Time{}, err
	}
	result, err := client.Certificate.Obtain(certificate.ObtainRequest{Domains: []string{domain}, Bundle: true})
	if err != nil {
		return nil, time.Time{}, err
	}
	block, _ := pem.Decode(result.Certificate)
	if block == nil {
		return nil, time.Time{}, errors.New("ACME returned an invalid certificate")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, time.Time{}, err
	}
	bundle := append(append(result.Certificate, '\n'), result.PrivateKey...)
	return bundle, cert.NotAfter, nil
}

type contextTransport struct {
	ctx  context.Context
	base http.RoundTripper
}

func (t contextTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	ctx, cancel := context.WithCancel(r.Context())
	stop := context.AfterFunc(t.ctx, cancel)
	res, e := t.base.RoundTrip(r.Clone(ctx))
	if e != nil {
		stop()
		cancel()
		return nil, e
	}
	res.Body = &contextBody{res.Body, func() { stop(); cancel() }}
	return res, nil
}

type contextBody struct {
	io.ReadCloser
	cleanup func()
}

func (b *contextBody) Close() error { defer b.cleanup(); return b.ReadCloser.Close() }
func FromEnv(s *db.Store) *ACME {
	return &ACME{Store: s, Email: os.Getenv("SHIPYARD_ACME_EMAIL"), Directory: os.Getenv("SHIPYARD_ACME_DIRECTORY"), AcceptTOS: os.Getenv("SHIPYARD_ACME_ACCEPT_TOS") == "true"}
}
