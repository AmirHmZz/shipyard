package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"

	"golang.org/x/net/idna"
)

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Admin bool   `json:"admin"`
	TOTP  bool   `json:"totp"`
}
type Resource struct {
	ID         string            `json:"id"`
	Kind       string            `json:"kind"`
	Name       string            `json:"name"`
	TeamID     string            `json:"teamId"`
	ParentID   string            `json:"parentId"`
	Data       json.RawMessage   `json:"data"`
	Secret     []byte            `json:"-"`
	SecretKeys []string          `json:"secretKeys"`
	Variables  map[string]string `json:"variables"`
	CanWrite   bool              `json:"canWrite"`
	Version    int               `json:"version"`
	CreatedAt  time.Time         `json:"createdAt"`
	UpdatedAt  time.Time         `json:"updatedAt"`
}

func Decode[T any](r Resource) (T, error) { var v T; err := json.Unmarshal(r.Data, &v); return v, err }

func IsDeleting(r Resource) bool {
	var state struct {
		Deleting bool `json:"deleting"`
	}
	_ = json.Unmarshal(r.Data, &state)
	return state.Deleting
}

type ResourceInput struct {
	Kind      string             `json:"kind"`
	Name      string             `json:"name"`
	TeamID    string             `json:"teamId"`
	ParentID  string             `json:"parentId"`
	Data      json.RawMessage    `json:"data"`
	Secrets   map[string]string  `json:"secrets"`
	Variables map[string]*string `json:"variables"`
	Version   int                `json:"version"`
}
type Server struct {
	Connection  string `json:"connection,omitempty"`
	DaemonID    string `json:"daemonId,omitempty"`
	AuthMethod  string `json:"authMethod"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	User        string `json:"user"`
	Fingerprint string `json:"fingerprint"`
	IPv4        string `json:"ipv4"`
	IPv6        string `json:"ipv6"`
}
type Git struct {
	Provider       string `json:"provider"`
	URL            string `json:"url"`
	AppID          string `json:"appId"`
	AppSlug        string `json:"appSlug,omitempty"`
	InstallationID string `json:"installationId"`
	AuthMethod     string `json:"authMethod,omitempty"`
	InstanceID     string `json:"instanceId,omitempty"`
	Status         string `json:"status,omitempty"`
	Account        string `json:"account,omitempty"`
}
type DNS struct {
	Provider string `json:"provider"`
	ProxyID  string `json:"proxyId,omitempty"`
}
type Zone struct {
	ProviderZoneID string `json:"providerZoneId"`
	Domain         string `json:"domain"`
}
type App struct {
	Workload        string                       `json:"workload,omitempty"`
	JobService      string                       `json:"jobService,omitempty"`
	Source          string                       `json:"source,omitempty"`
	Engine          string                       `json:"engine"`
	ServerID        string                       `json:"serverId"`
	GitID           string                       `json:"gitId"`
	Repository      string                       `json:"repository"`
	Branch          string                       `json:"branch"`
	Context         string                       `json:"context"`
	File            string                       `json:"file"`
	Port            int                          `json:"port,omitempty"` // Legacy snapshots only.
	Worker          bool                         `json:"worker"`
	AutoDeploy      bool                         `json:"autoDeploy"`
	Previews        bool                         `json:"previews"`
	HealthPath      string                       `json:"healthPath,omitempty"` // Legacy snapshots only.
	ReadinessChecks []HTTPReadinessCheck         `json:"readinessChecks"`
	ReadinessMode   string                       `json:"readinessMode,omitempty"`
	PreviewRouting  *PreviewRouting              `json:"previewRouting,omitempty"`
	HealthTimeout   int                          `json:"healthTimeout"`
	Profiles        []string                     `json:"profiles"`
	BuildArgs       map[string]string            `json:"buildArgs"`
	Registry        string                       `json:"registry,omitempty"` // Legacy encrypted snapshots only.
	RegistryUser    string                       `json:"registryUser,omitempty"`
	PreviewOf       string                       `json:"previewOf,omitempty"`
	PR              int                          `json:"pr,omitempty"`
	ApprovedSHA     string                       `json:"approvedSha,omitempty"`
	PreviewSHA      string                       `json:"previewSha,omitempty"`
	PreviewClosed   bool                         `json:"previewClosed,omitempty"`
	PreviewDomain   string                       `json:"previewDomain,omitempty"`
	PreviewZoneID   string                       `json:"previewZoneId,omitempty"`
	Networking      map[string]ServiceNetworking `json:"networking,omitempty"`
	PublishedPorts  map[string][]PublishedPort   `json:"publishedPorts,omitempty"`
}
type Route struct {
	Protocol   string `json:"protocol"`
	Domain     string `json:"domain"`
	Service    string `json:"service"`
	TargetPort int    `json:"targetPort"`
	ListenPort int    `json:"listenPort"`
	TLS        string `json:"tls"`
	ZoneID     string `json:"zoneId"`
}
type Webhook struct {
	URL      string   `json:"url"`
	Events   []string `json:"events"`
	Provider string   `json:"provider,omitempty"`
	ChatID   string   `json:"chatId,omitempty"`
	ProxyID  string   `json:"proxyId,omitempty"`
}

func (w Webhook) Messenger() bool { return w.Provider == "telegram" || w.Provider == "bale" }

type OutboundProxy struct {
	Scheme string `json:"scheme"`
	Host   string `json:"host"`
	Port   int    `json:"port"`
}

func (p OutboundProxy) Validate() error {
	if (p.Scheme != "socks5" && p.Scheme != "socks5h") || p.Port < 1 || p.Port > 65535 || p.Host == "" || strings.ContainsAny(p.Host, " /\\@?#\r\n\t") {
		return errors.New("proxy requires SOCKS5 or SOCKS5H, a hostname or IP, and port 1–65535")
	}
	if strings.Contains(p.Host, ":") && net.ParseIP(p.Host) == nil {
		return errors.New("invalid proxy host")
	}
	return nil
}

type Target struct {
	Service   string `json:"service"`
	Container string `json:"container"`
	Port      int    `json:"port"`
	Address   string `json:"address"`
	NetworkID string `json:"networkId"`
}
type Release struct {
	ID           string            `json:"id"`
	AppID        string            `json:"applicationId"`
	TeamID       string            `json:"teamId"`
	DeploymentID string            `json:"deploymentId"`
	ServerID     string            `json:"serverId"`
	Commit       string            `json:"commit"`
	App          App               `json:"app"`
	Env          map[string]string `json:"-"`
	BuildSecrets map[string]string `json:"-"`
	Images       map[string]string `json:"images"`
	Targets      []Target          `json:"targets"`
	Networks     []NetworkEndpoint `json:"networks,omitempty"`
	Containers   []string          `json:"containers"`
	Compose      string            `json:"compose"`
	Directory    string            `json:"directory"`
	Routes       []Resource        `json:"routes"`
	CreatedAt    time.Time         `json:"createdAt"`
}

// ReleaseEnvelope deliberately includes secrets only inside vault-encrypted storage.
type ReleaseEnvelope struct {
	Release      Release           `json:"release"`
	Env          map[string]string `json:"env"`
	BuildSecrets map[string]string `json:"buildSecrets"`
}
type Deployment struct {
	ID            string    `json:"id"`
	AppID         string    `json:"applicationId"`
	State         string    `json:"state"`
	Phase         string    `json:"phase"`
	Commit        string    `json:"commit"`
	Error         string    `json:"error"`
	ReleaseID     string    `json:"releaseId"`
	RollbackID    string    `json:"rollbackId"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	Deleting      bool      `json:"deleting,omitempty"`
	DeletionError string    `json:"deletionError,omitempty"`
}
type Event struct {
	ID           int64     `json:"id"`
	DeploymentID string    `json:"deploymentId"`
	Message      string    `json:"message"`
	CreatedAt    time.Time `json:"createdAt"`
}
type Job struct {
	ID         string
	Kind       string
	ResourceID string
	Payload    json.RawMessage
	Attempts   int
}
type DNSRecord struct {
	ID       string          `json:"id,omitempty"`
	Type     string          `json:"type"`
	Name     string          `json:"name"`
	Content  string          `json:"content"`
	TTL      int             `json:"ttl"`
	Proxied  bool            `json:"proxied"`
	Priority *int            `json:"priority,omitempty"`
	Data     json.RawMessage `json:"data,omitempty"`
	Extra    json.RawMessage `json:"extra,omitempty"`
}

var envKey = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
var sha = regexp.MustCompile(`^[a-fA-F0-9]{40,64}$`)

func ValidSHA(s string) bool { return sha.MatchString(s) }
func ValidEnv(s string) bool { return envKey.MatchString(s) }
func Relative(s string) bool {
	return s != "" && !strings.ContainsAny(s, "\x00\r\n\\") && !strings.HasPrefix(s, "/") && path.Clean(s) != ".." && !strings.HasPrefix(path.Clean(s), "../") && !strings.Contains(s, ":")
}
func Domain(s string) (string, error) {
	s = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(s), "."))
	wildcard := strings.HasPrefix(s, "*.")
	s = strings.TrimPrefix(s, "*.")
	a, err := idna.Lookup.ToASCII(s)
	if err != nil || len(a) > 253 || !strings.Contains(a, ".") || net.ParseIP(a) != nil {
		return "", errors.New("invalid domain name")
	}
	for _, label := range strings.Split(a, ".") {
		if len(label) < 1 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return "", errors.New("invalid domain label")
		}
		for _, c := range label {
			if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
				return "", errors.New("invalid domain character")
			}
		}
	}
	if wildcard {
		a = "*." + a
	}
	return a, nil
}
func HTTPS(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil && u.Fragment == ""
}
func Validate(r ResourceInput) error {
	var metadata map[string]json.RawMessage
	_ = json.Unmarshal(r.Data, &metadata)
	for _, key := range []string{"deleting", "deletionRoot", "deletionError"} {
		if _, ok := metadata[key]; ok {
			return errors.New("deletion state is managed by Shipyard")
		}
	}
	if r.Kind != "route" && (strings.TrimSpace(r.Name) == "" || len(r.Name) > 120) {
		return errors.New("name must contain 1–120 characters")
	}
	if len(r.Data) == 0 || !json.Valid(r.Data) {
		return errors.New("data must be a JSON object")
	}
	var object map[string]json.RawMessage
	if json.Unmarshal(r.Data, &object) != nil || object == nil {
		return errors.New("data must be an object")
	}
	for k, v := range r.Secrets {
		if len(v) > 1048576 || len(k) > 200 {
			return errors.New("secret too large")
		}
		if strings.Contains(k, ":") {
			if err := ValidateVariableKey(r.Kind, k, true); err != nil {
				return err
			}
		}
	}
	for k, v := range r.Variables {
		if err := ValidateVariableKey(r.Kind, k, false); err != nil {
			return err
		}
		if len(k) > 200 || v != nil && len(*v) > 1048576 {
			return errors.New("variable too large")
		}
		if _, exists := r.Secrets[k]; exists {
			return errors.New("conflicting variable and secret writes")
		}
	}
	x := Resource{Data: r.Data}
	if r.Kind == "proxy" || r.Kind == "webhook" {
		keys := []string{"token", "password", "signing_secret"}
		if r.Kind == "proxy" {
			keys = append(keys, "username")
		}
		for _, key := range keys {
			if _, exists := object[key]; exists {
				return errors.New("credentials must be supplied as encrypted secrets")
			}
		}
	}
	switch r.Kind {
	case "team", "project", "environment":
	case "registry":
		v, e := Decode[Registry](x)
		if e != nil {
			return e
		}
		if _, e = RegistryHostname(v.Hostname); e != nil {
			return e
		}
		if strings.TrimSpace(v.Username) == "" || strings.ContainsAny(v.Username, "\r\n\x00") {
			return errors.New("registry username is required")
		}
	case "server":
		for _, key := range []string{"previewDomain", "previewZoneId"} {
			if _, exists := object[key]; exists {
				return errors.New("preview domains are configured on applications")
			}
		}
		v, e := Decode[Server](x)
		if e != nil {
			return e
		}
		if v.Connection != "" && v.Connection != "ssh" && v.Connection != "local" {
			return errors.New("unsupported server connection")
		}
		if v.Connection == "local" && v.DaemonID == "" {
			return errors.New("local Docker identity required")
		}
		if v.Connection != "local" && (v.Host == "" || strings.ContainsAny(v.Host, "\r\n\x00") || v.User == "" || v.Port < 1 || v.Port > 65535 || !strings.HasPrefix(v.Fingerprint, "SHA256:")) {
			return errors.New("host, port, SSH user and verified SHA256 fingerprint are required")
		}
		if v.AuthMethod != "" && v.AuthMethod != "private_key" && v.AuthMethod != "password" {
			return errors.New("SSH authentication must use a private key or password")
		}
		if v.IPv4 != "" && (net.ParseIP(v.IPv4) == nil || net.ParseIP(v.IPv4).To4() == nil) || v.IPv6 != "" && (net.ParseIP(v.IPv6) == nil || net.ParseIP(v.IPv6).To4() != nil) {
			return errors.New("invalid public IP")
		}
	case "git":
		v, e := Decode[Git](x)
		if e != nil {
			return e
		}
		if v.Provider != "github" && v.Provider != "gitea" {
			return errors.New("unsupported Git provider")
		}
		if v.Provider == "gitea" && !HTTPS(v.URL) {
			return errors.New("Gitea requires an HTTPS instance URL")
		}
	case "dns":
		v, e := Decode[DNS](x)
		if e != nil {
			return e
		}
		if v.Provider != "cloudflare" && v.Provider != "arvancloud" {
			return errors.New("unsupported DNS provider")
		}
	case "zone":
		v, e := Decode[Zone](x)
		if e != nil {
			return e
		}
		if _, e = Domain(v.Domain); e != nil {
			return e
		}
		if v.ProviderZoneID == "" {
			return errors.New("provider zone ID is required")
		}
	case "application":
		if r.Secrets["registry_password"] != "" {
			return errors.New("registry credentials are managed in Integrations")
		}
		v, e := Decode[App](x)
		if e != nil {
			return e
		}
		if e = ValidateJobApplication(v); e != nil {
			return e
		}
		if v.Registry != "" || v.RegistryUser != "" {
			return errors.New("registry credentials are managed in Integrations")
		}
		if e = ValidateNetworking(v); e != nil {
			return e
		}
		if v.Previews && (v.PreviewRouting == nil || v.PreviewRouting.Mode != "private") {
			if d, err := Domain(v.PreviewDomain); err != nil || !strings.HasPrefix(d, "*.") || v.PreviewZoneID == "" {
				return errors.New("previews require a wildcard domain and connected DNS zone")
			}
		}
		if v.Engine != "dockerfile" && v.Engine != "compose" {
			return errors.New("engine must be dockerfile or compose")
		}
		if v.Source != "" && v.Source != "git" && v.Source != "compose" {
			return errors.New("source must be git or compose")
		}
		if v.Source == "compose" {
			if v.Engine != "compose" || v.ServerID == "" {
				return errors.New("Direct Compose requires the Compose engine and a server")
			}
			if v.GitID != "" || v.Repository != "" || v.Branch != "" || v.AutoDeploy || v.Previews {
				return errors.New("Direct Compose does not use Git, push deployments or PR previews")
			}
			if v.Context != "." || v.File != "compose.yaml" {
				return errors.New("Direct Compose uses context . and compose.yaml")
			}
		} else if v.ServerID == "" || v.GitID == "" || v.Repository == "" || strings.HasPrefix(v.Repository, "-") || v.Branch == "" || strings.HasPrefix(v.Branch, "-") {
			return errors.New("server, Git connection, repository and branch are required")
		}
		if strings.ContainsAny(v.Repository+v.Branch, "\x00\r\n") {
			return errors.New("invalid repository/ref")
		}
		if !Relative(v.Context) || !Relative(v.File) {
			return errors.New("build context and file must stay inside the repository")
		}
		if v.Port < 0 || v.Port > 65535 {
			return errors.New("invalid application port")
		}
		if v.HealthPath != "" && (!strings.HasPrefix(v.HealthPath, "/") || strings.ContainsAny(v.HealthPath, "\r\n")) {
			return errors.New("health path must begin with /")
		}
		if err := ValidateApplicationChecks(v); err != nil {
			return err
		}
		for k := range v.BuildArgs {
			if !ValidEnv(k) {
				return errors.New("invalid build argument")
			}
		}
	case "route":
		v, e := Decode[Route](x)
		if e != nil {
			return e
		}
		if v.Protocol != "https" && v.Protocol != "grpc" && v.Protocol != "tcp" {
			return errors.New("invalid route protocol")
		}
		if v.TargetPort < 1 || v.TargetPort > 65535 {
			return errors.New("invalid target port")
		}
		if v.Protocol == "tcp" {
			if v.ListenPort < 1 || v.ListenPort > 65535 || v.ListenPort == 80 || v.ListenPort == 443 || v.ListenPort == 22 {
				return errors.New("TCP requires a dedicated port other than 22, 80 or 443")
			}
		}
		if v.Protocol != "tcp" || v.TLS == "terminate" || v.Domain != "" {
			if _, e = Domain(v.Domain); e != nil {
				return e
			}
		}
		if v.TLS != "terminate" && v.TLS != "passthrough" {
			return errors.New("TLS must be terminate or passthrough")
		}
		if v.Protocol != "tcp" && v.TLS == "passthrough" {
			return errors.New("TLS passthrough is available only for TCP")
		}
		if v.TLS == "terminate" && v.ZoneID == "" {
			return errors.New("automatic TLS requires a DNS zone")
		}
		if v.ZoneID == "" {
			return errors.New("select a connected DNS zone")
		}
		if _, e = Domain(v.Domain); e != nil {
			return e
		}
		var fields map[string]json.RawMessage
		_ = json.Unmarshal(x.Data, &fields)
		for _, key := range []string{"backendTls", "backendServerName", "redirect"} {
			if _, ok := fields[key]; ok {
				return fmt.Errorf("%s is no longer configurable", key)
			}
		}
		if _, exists := fields["path"]; exists {
			return errors.New("path routing is no longer supported; use a domain")
		}
		if _, exists := fields["stripPrefix"]; exists {
			return errors.New("prefix stripping is no longer supported")
		}
	case "network":
		v, e := Decode[Network](x)
		if e != nil {
			return e
		}
		if v.ServerID == "" {
			return errors.New("network requires a server")
		}
		for _, raw := range []string{v.Subnet, v.DynamicRange, v.IPv6Subnet, v.IPv6DynamicRange} {
			if raw != "" {
				if _, e := netip.ParsePrefix(raw); e != nil {
					return errors.New("invalid network subnet or allocation range")
				}
			}
		}
	case "proxy":
		v, e := Decode[OutboundProxy](x)
		if e != nil {
			return e
		}
		return v.Validate()
	case "webhook":
		v, e := Decode[Webhook](x)
		if e != nil {
			return e
		}
		if v.Messenger() {
			if v.ChatID == "" || len(v.ChatID) > 128 || strings.ContainsAny(v.ChatID, "\r\n /\\") {
				return errors.New("enter a chat ID or channel username")
			}
		} else if v.Provider != "" && v.Provider != "webhook" {
			return errors.New("unsupported notification provider")
		} else if !HTTPS(v.URL) {
			return errors.New("notification endpoint requires HTTPS")
		}
	default:
		return fmt.Errorf("unknown resource kind %q", r.Kind)
	}
	return nil
}

// ValidateVariableKey limits ordinary values to runtime scopes. BuildKit values
// always remain write-only secrets.
func ValidateVariableKey(kind, key string, secret bool) error {
	if kind != "team" && kind != "project" && kind != "environment" && kind != "application" {
		return errors.New("variables require a team, project, environment or application")
	}
	scope, name, ok := strings.Cut(key, ":")
	if !ok || !ValidEnv(name) {
		return errors.New("invalid variable name")
	}
	if scope == "env" || scope == "preview-env" || secret && (scope == "build" || scope == "preview-build") {
		return nil
	}
	return errors.New("invalid variable scope")
}
