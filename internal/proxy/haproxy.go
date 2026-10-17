package proxy

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"io"
	"net"
	"strconv"
	"strings"
	"time"

	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

type Binding struct {
	Unavailable bool
	ID          string
	FrontendID  string
	Route       model.Route
	Targets     []model.Target
	Certificate bool
}

func Render(bindings []Binding, options ...Options) (string, error) {
	var opts Options
	if len(options) > 0 {
		opts = options[0]
	}
	var err error
	opts.Bindings, err = NormalizeBindings(opts.Bindings)
	if err != nil {
		return "", err
	}
	if _, err := RoutingMaps(bindings); err != nil {
		return "", err
	}
	var cfg strings.Builder
	bind := func(id string, port int, options string) {
		addresses, exists := opts.Bindings[id]
		if !exists {
			addresses = DefaultAddresses(opts.IPv6)
		}
		for _, address := range addresses {
			v6only := ""
			if strings.Contains(address, ":") {
				v6only = " v6only"
			}
			cfg.WriteString(fmt.Sprintf("  bind %s%s%s\n", net.JoinHostPort(address, strconv.Itoa(port)), v6only, options))
		}
	}
	cfg.WriteString("global\n  log stdout format raw local0\n  master-worker\n  maxconn 4096\n  hard-stop-after 1h\n  stats socket /var/lib/haproxy/admin.sock mode 600 level admin\n\ndefaults\n  log global\n  timeout connect 5s\n  timeout client 1h\n  timeout server 1h\n  timeout tunnel 1h\n\n")
	hasCert := false
	for _, b := range bindings {
		if b.Certificate && !b.Unavailable && b.Route.Protocol != "tcp" {
			hasCert = true
		}
	}
	cfg.WriteString("frontend web\n  mode http\n")
	bind("web", 80, "")
	if hasCert {
		bind("web", 443, " ssl crt /usr/local/etc/haproxy/certs/ alpn h2,http/1.1")
	}
	cfg.WriteString("  option httplog\n  http-request set-header X-Forwarded-Proto https if { ssl_fc }\n  http-request set-header X-Forwarded-Proto http unless { ssl_fc }\n  option forwardfor\n")
	if opts.Challenge != nil && len(opts.Challenge.Domains) > 0 {
		ch := opts.Challenge
		if net.ParseIP(ch.Target.Address) == nil || ch.Target.Port < 1 || ch.Target.Port > 65535 {
			return "", errors.New("invalid ACME backend")
		}
		for _, domain := range ch.Domains {
			canonical, e := model.Domain(domain)
			if e != nil || canonical != domain || strings.HasPrefix(domain, "*.") {
				return "", errors.New("invalid ACME hostname")
			}
		}
		cfg.WriteString("  acl acme_host req.hdr(host),lower,field(1,:),regsub(\\.$,,) -m str " + strings.Join(ch.Domains, " ") + "\n  acl acme_path path_reg ^/\\.well-known/acme-challenge/[A-Za-z0-9_-]{16,256}$\n  http-request set-var(txn.acme_request) bool(true) if !{ ssl_fc } acme_host acme_path\n  use_backend shipyard_acme if { var(txn.acme_request) -m bool }\n")
	} else {
		// Missing transaction variables evaluate false, including hosts with no challenges.
	}
	ports := map[int]bool{}
	for _, b := range bindings {
		r := b.Route
		if r.Protocol != "https" && r.Protocol != "grpc" && r.Protocol != "tcp" {
			return "", errors.New("only HTTPS, gRPC and TLS TCP routes are supported")
		}
		if r.TLS != "terminate" && r.TLS != "passthrough" {
			return "", errors.New("TLS termination or TCP passthrough is required")
		}
		if len(b.Targets) == 0 {
			continue
		}
		if !safeID(b.ID) {
			return "", errors.New("invalid route ID")
		}
		if r.Protocol == "tcp" {
			if r.ListenPort == 80 || r.ListenPort == 443 || r.ListenPort < 1 || ports[r.ListenPort] {
				return "", errors.New("TCP port collision")
			}
			ports[r.ListenPort] = true
			continue
		}
	}
	cfg.WriteString("  http-request set-var(txn.shipyard_host) req.hdr(host),lower,field(1,:),regsub(\\.$,,)\n  http-request set-var(txn.shipyard_backend) var(txn.shipyard_host),map(/usr/local/etc/haproxy/maps/hosts.map)\n  http-request set-var(txn.shipyard_backend) var(txn.shipyard_host),map_reg(/usr/local/etc/haproxy/maps/wildcards.map,unavailable) unless { var(txn.shipyard_backend) -m found }\n  http-request redirect scheme https code 308 if !{ ssl_fc } !{ var(txn.acme_request) -m bool } { var(txn.shipyard_backend),map(/usr/local/etc/haproxy/maps/redirects.map,0) -m int eq 1 }\n  use_backend %[var(txn.shipyard_backend)]\n")
	cfg.WriteString("  default_backend unavailable\n\nbackend unavailable\n  mode http\n  http-request return status 503 content-type text/plain string No_healthy_application\n\n")
	if opts.Challenge != nil && len(opts.Challenge.Domains) > 0 {
		cfg.WriteString(fmt.Sprintf("backend shipyard_acme\n  mode http\n  server dashboard %s check\n\n", net.JoinHostPort(opts.Challenge.Target.Address, strconv.Itoa(opts.Challenge.Target.Port))))
	}
	for _, b := range bindings {
		r := b.Route
		if len(b.Targets) == 0 || b.Unavailable {
			continue
		}
		if r.Protocol == "tcp" && r.TLS == "terminate" && !b.Certificate {
			continue
		}
		if r.Protocol == "tcp" {
			cfg.WriteString("frontend tcp_" + b.ID + "\n  mode tcp\n")
			options := ""
			if r.TLS == "terminate" {
				if !b.Certificate {
					continue
				}
				options = " ssl crt /usr/local/etc/haproxy/certs/" + b.ID + ".pem"
			}
			id := b.FrontendID
			if id == "" {
				id = b.ID
			}
			bind(id, r.ListenPort, options)
			cfg.WriteString("  default_backend b_" + b.ID + "\n\n")
		}
		cfg.WriteString("backend b_" + b.ID + "\n")
		if r.Protocol == "tcp" {
			cfg.WriteString("  mode tcp\n  balance leastconn\n")
		} else {
			cfg.WriteString("  mode http\n  balance roundrobin\n")
		}
		for i, t := range b.Targets {
			if t.Port < 1 || t.Port > 65535 || net.ParseIP(t.Address) == nil {
				return "", errors.New("invalid backend port")
			}
			cfg.WriteString(fmt.Sprintf("  server s%d %s check", i, net.JoinHostPort(t.Address, strconv.Itoa(t.Port))))
			if r.Protocol == "grpc" {
				cfg.WriteString(" proto h2")
			}
			cfg.WriteString("\n")
		}
		cfg.WriteString("\n")
	}
	return cfg.String(), nil
}
func safeID(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}
func Apply(ctx context.Context, r remote.Executor, config string, certs map[string][]byte, log io.Writer, routingMaps ...map[string][]byte) error {
	if err := recoverPending(ctx, r); err != nil {
		return fmt.Errorf("recover interrupted HAProxy update: %w", err)
	}
	image, existed, err := runtimeImage(ctx, r, log)
	if err != nil {
		return err
	}
	root := remote.Root + "/proxy"
	stage := root + "/stage-" + uuid.NewString()
	uidText, err := deploy.Output(ctx, r, "id", "-u")
	if err != nil {
		return err
	}
	uid, err := strconv.Atoi(strings.TrimSpace(uidText))
	if err != nil || uid < 0 {
		return errors.New("invalid deployment SSH user ID")
	}
	config = strings.Replace(config, "admin.sock mode 600 level admin", fmt.Sprintf("admin.sock mode 600 uid %d level admin", uid), 1)
	generation := uuid.NewString()
	config = strings.Replace(config, "global\n", "global\n  setenv SHIPYARD_GENERATION "+generation+"\n", 1)
	if e := r.Run(ctx, "umask 077; "+remote.Command("mkdir", "-p", stage+"/certs")+" && "+remote.Command("chmod", "700", root), nil, log); e != nil {
		return e
	}
	defer r.Run(context.WithoutCancel(ctx), remote.Command("rm", "-rf", stage), nil, io.Discard)
	maps, _ := RoutingMaps(nil)
	if len(routingMaps) > 0 {
		maps = routingMaps[0]
	}
	if e := r.Run(ctx, remote.Command("mkdir", "-p", stage+"/maps"), nil, log); e != nil {
		return e
	}
	for name, content := range maps {
		if name != "hosts.map" && name != "wildcards.map" && name != "redirects.map" {
			return errors.New("invalid routing map name")
		}
		if e := deploy.Write(ctx, r, stage+"/maps/"+name, content); e != nil {
			return e
		}
	}
	for id, cert := range certs {
		if !safeID(id) {
			return errors.New("invalid certificate ID")
		}
		if e := deploy.Write(ctx, r, stage+"/certs/"+id+".pem", cert); e != nil {
			return e
		}
	}
	if e := deploy.Write(ctx, r, stage+"/haproxy.cfg", []byte(config)); e != nil {
		return e
	}
	args := []string{"docker", "run", "--rm", "--user", "0", "--network", "host", "-v", stage + ":/usr/local/etc/haproxy:ro", image, "haproxy", "-c", "-f", "/usr/local/etc/haproxy/haproxy.cfg"}
	var diagnostic bytes.Buffer
	if e := r.Run(ctx, remote.Command(args...), nil, io.MultiWriter(log, &diagnostic)); e != nil {
		return fmt.Errorf("HAProxy configuration validation failed: %w: %s", e, strings.TrimSpace(diagnostic.String()))
	}
	// Config and certificate files persist across reloads; Runtime API state alone is insufficient.
	pending := "new"
	if existed {
		pending = "existing"
	}
	script := `set -eu
cd /var/lib/shipyard/proxy
if [ -f haproxy.cfg ]; then cp haproxy.cfg previous.cfg; else rm -f previous.cfg; fi
rm -rf previous-certs
if [ -d certs ]; then cp -a certs previous-certs; fi
rm -rf previous-maps
if [ -d maps ]; then cp -a maps previous-maps; fi
printf '%s\n' ` + remote.Quote(pending) + ` > pending
rm -rf certs
cp -a ` + remote.Quote(stage+"/certs") + ` certs
rm -rf maps
cp -a ` + remote.Quote(stage+"/maps") + ` maps
cp ` + remote.Quote(stage+"/haproxy.cfg") + ` candidate.cfg
mv candidate.cfg haproxy.cfg
if [ "$(docker inspect -f '{{.State.Running}}' shipyard-haproxy 2>/dev/null || true)" = true ]; then
  docker kill --signal USR2 shipyard-haproxy >/dev/null
elif docker inspect shipyard-haproxy >/dev/null 2>&1; then
  docker start shipyard-haproxy >/dev/null
else
  docker run -d --name shipyard-haproxy --restart unless-stopped --network host --user 0 -v /var/lib/shipyard/proxy:/usr/local/etc/haproxy -v /var/lib/shipyard/proxy:/var/lib/haproxy ` + remote.Quote(image) + ` haproxy -W -db -f /usr/local/etc/haproxy/haproxy.cfg
fi
sleep 1
if [ "$(docker inspect -f '{{.State.Running}}' shipyard-haproxy)" != true ]; then
  echo 'HAProxy failed to load candidate'; exit 1
fi
`
	applyErr := r.Run(ctx, remote.Command("sh", "-c", script), nil, log)
	if applyErr == nil {
		applyErr = awaitGeneration(ctx, r, generation)
	}
	if applyErr != nil {
		recoverCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancel()
		if recoveryErr := recoverPending(recoverCtx, r); recoveryErr != nil {
			return fmt.Errorf("%w; previous HAProxy generation recovery failed: %v", applyErr, recoveryErr)
		}
		return applyErr
	}
	return r.Run(ctx, remote.Command("rm", "-f", root+"/pending"), nil, io.Discard)
}

func awaitGeneration(ctx context.Context, r remote.Executor, generation string) error {
	dialer, ok := r.(interface {
		DialContext(context.Context, string, string) (net.Conn, error)
	})
	if !ok {
		return errors.New("HAProxy reload verification requires SSH Unix socket forwarding")
	}
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	var last error
	for ctx.Err() == nil {
		probe, stop := context.WithTimeout(ctx, 2*time.Second)
		conn, err := dialer.DialContext(probe, "unix", remote.Root+"/proxy/admin.sock")
		if err == nil {
			closeOnCancel := context.AfterFunc(probe, func() { conn.Close() })
			_, err = io.WriteString(conn, "show env SHIPYARD_GENERATION\n")
			if err == nil {
				var b []byte
				b, err = io.ReadAll(io.LimitReader(conn, 4096))
				if err == nil && strings.Contains(string(b), "SHIPYARD_GENERATION="+generation) {
					closeOnCancel()
					conn.Close()
					stop()
					return nil
				}
			}
			closeOnCancel()
			conn.Close()
		}
		last = err
		stop()
		select {
		case <-ctx.Done():
		case <-time.After(200 * time.Millisecond):
		}
	}
	return fmt.Errorf("HAProxy did not acknowledge the new generation; check SSH AllowStreamLocalForwarding local and managed-directory permissions: %v", last)
}
