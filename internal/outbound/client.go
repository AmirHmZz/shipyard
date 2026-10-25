// Package outbound builds isolated direct and SOCKS transports. It never changes
// process-wide proxy variables, and never falls back from a configured proxy.
package outbound

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strconv"
	"time"

	"golang.org/x/net/proxy"
	"shipyard/internal/db"
	"shipyard/internal/model"
)

func Transport(spec *model.OutboundProxy, username, password string) (*http.Transport, error) {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.Proxy = nil
	forward := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	t.DialContext = forward.DialContext
	if spec == nil {
		return t, nil
	}
	if err := spec.Validate(); err != nil {
		return nil, err
	}
	if len(username) > 255 || len(password) > 255 {
		return nil, errors.New("proxy credentials exceed 255 bytes")
	}
	var auth *proxy.Auth
	if username != "" || password != "" {
		auth = &proxy.Auth{User: username, Password: password}
	}
	d, err := proxy.SOCKS5("tcp", net.JoinHostPort(spec.Host, strconv.Itoa(spec.Port)), auth, forward)
	if err != nil {
		return nil, errors.New("cannot configure SOCKS proxy")
	}
	cd, ok := d.(proxy.ContextDialer)
	if !ok {
		return nil, errors.New("SOCKS proxy does not support cancellation")
	}
	t.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		if spec.Scheme == "socks5" {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, errors.New("invalid destination")
			}
			if net.ParseIP(host) == nil {
				ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
				if err != nil || len(ips) == 0 {
					return nil, errors.New("destination DNS lookup failed")
				}
				address = net.JoinHostPort(ips[0].IP.String(), port)
			}
		}
		conn, err := cd.DialContext(ctx, network, address)
		if err != nil {
			return nil, errors.New("SOCKS proxy connection failed")
		}
		return conn, nil
	}
	return t, nil
}

func Client(ctx context.Context, store *db.Store, id string) (*http.Client, error) {
	var spec *model.OutboundProxy
	var username, password string
	if id != "" {
		r, err := store.Resource(ctx, id)
		if err != nil || r.Kind != "proxy" || model.IsDeleting(r) {
			return nil, errors.New("selected proxy is unavailable")
		}
		v, err := model.Decode[model.OutboundProxy](r)
		if err != nil {
			return nil, errors.New("invalid proxy configuration")
		}
		secrets, err := store.Secrets(r)
		if err != nil {
			return nil, errors.New("proxy credentials unavailable")
		}
		spec, username, password = &v, secrets["username"], secrets["password"]
	}
	t, err := Transport(spec, username, password)
	if err != nil {
		return nil, err
	}
	return &http.Client{Transport: t, Timeout: 30 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 3 || len(via) > 0 && (req.URL.Host != via[0].URL.Host || req.URL.Scheme != via[0].URL.Scheme) {
			return errors.New("redirect refused")
		}
		return nil
	}}, nil
}
