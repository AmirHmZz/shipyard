package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"

	"shipyard/internal/model"
)

type ProviderZone struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type DNSProvider interface {
	Zones(context.Context) ([]ProviderZone, error)
	Records(context.Context, string) ([]model.DNSRecord, error)
	Put(context.Context, string, model.DNSRecord) (model.DNSRecord, error)
	Delete(context.Context, string, string) error
}
type DNSClient struct {
	Provider string
	Token    string
	Base     string
	HTTP     *http.Client
}

func NewDNS(provider, token string) *DNSClient {
	base := "https://api.cloudflare.com/client/v4"
	if provider == "arvancloud" {
		base = "https://napi.arvancloud.ir/cdn/4.0"
	}
	return &DNSClient{provider, token, base, HTTPClient()}
}
func ArvanAuthorization(token string) string {
	token = strings.TrimSpace(token)
	if strings.HasPrefix(strings.ToLower(token), "apikey ") {
		token = strings.TrimSpace(token[len("apikey "):])
	}
	return "Apikey " + token
}
func (d *DNSClient) request(ctx context.Context, method, path string, payload, out any) error {
	defer d.HTTP.CloseIdleConnections()
	var b bytes.Buffer
	if payload != nil {
		if e := json.NewEncoder(&b).Encode(payload); e != nil {
			return e
		}
	}
	req, e := http.NewRequestWithContext(ctx, method, d.Base+path, &b)
	if e != nil {
		return e
	}
	auth := "Bearer " + d.Token
	if d.Provider == "arvancloud" {
		auth = ArvanAuthorization(d.Token)
	}
	req.Header.Set("Authorization", auth)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	res, e := d.HTTP.Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("DNS provider returned HTTP %d", res.StatusCode)
	}
	if out == nil {
		return nil
	}
	var wrapper struct {
		Success *bool           `json:"success"`
		Result  json.RawMessage `json:"result"`
		Data    json.RawMessage `json:"data"`
	}
	if e = json.NewDecoder(io.LimitReader(res.Body, 8<<20)).Decode(&wrapper); e != nil {
		return e
	}
	if wrapper.Success != nil && !*wrapper.Success {
		return errors.New("DNS provider rejected the request")
	}
	raw := wrapper.Result
	if d.Provider == "arvancloud" {
		raw = wrapper.Data
	}
	if len(raw) == 0 {
		return errors.New("DNS provider returned no data")
	}
	return json.Unmarshal(raw, out)
}
func (d *DNSClient) Zones(ctx context.Context) ([]ProviderZone, error) {
	out := []ProviderZone{}
	for page := 1; page <= 100; page++ {
		path := fmt.Sprintf("/zones?per_page=100&page=%d", page)
		if d.Provider == "arvancloud" {
			path = fmt.Sprintf("/domains?per_page=100&page=%d", page)
		}
		var rows []map[string]any
		if e := d.request(ctx, "GET", path, nil, &rows); e != nil {
			return nil, e
		}
		for _, row := range rows {
			id, _ := row["id"].(string)
			name, _ := row["name"].(string)
			if d.Provider == "arvancloud" {
				if domain, ok := row["domain"].(string); ok {
					name = domain
				}
				id = name
			}
			out = append(out, ProviderZone{id, name})
		}
		if len(rows) < 100 {
			break
		}
	}
	return out, nil
}
func (d *DNSClient) recordPath(zone string) string {
	if d.Provider == "arvancloud" {
		return "/domains/" + url.PathEscape(zone) + "/dns-records"
	}
	return "/zones/" + url.PathEscape(zone) + "/dns_records"
}
func (d *DNSClient) Records(ctx context.Context, zone string) ([]model.DNSRecord, error) {
	out := []model.DNSRecord{}
	for page := 1; page <= 100; page++ {
		var raw []json.RawMessage
		if e := d.request(ctx, "GET", d.recordPath(zone)+fmt.Sprintf("?per_page=100&page=%d", page), nil, &raw); e != nil {
			return nil, e
		}
		for _, b := range raw {
			r, e := d.decode(b, zone)
			if e != nil {
				return nil, e
			}
			out = append(out, r)
		}
		if len(raw) < 100 {
			break
		}
	}
	return out, nil
}
func (d *DNSClient) decode(raw json.RawMessage, zone string) (model.DNSRecord, error) {
	var r model.DNSRecord
	if d.Provider == "cloudflare" {
		if e := json.Unmarshal(raw, &r); e != nil {
			return r, e
		}
		r.Extra = raw
		return r, nil
	}
	var v struct {
		ID    string          `json:"id"`
		Name  string          `json:"name"`
		Type  string          `json:"type"`
		TTL   int             `json:"ttl"`
		Cloud bool            `json:"cloud"`
		Value json.RawMessage `json:"value"`
	}
	if e := json.Unmarshal(raw, &v); e != nil {
		return r, e
	}
	r = model.DNSRecord{ID: v.ID, Name: v.Name, Type: strings.ToUpper(v.Type), TTL: v.TTL, Proxied: v.Cloud, Data: v.Value, Extra: raw}
	if r.Name == "@" {
		r.Name = zone
	} else if !strings.HasSuffix(r.Name, "."+zone) && r.Name != zone {
		r.Name += "." + zone
	}
	var value any
	_ = json.Unmarshal(v.Value, &value)
	decodeFields := func(fields map[string]any) {
		for _, key := range []string{"text", "domain", "host", "ip", "target", "value"} {
			if text, ok := fields[key].(string); ok {
				r.Content = text
				break
			}
		}
		if priority, ok := fields["priority"].(float64); ok {
			p := int(priority)
			r.Priority = &p
		}
	}
	switch v := value.(type) {
	case []any:
		if len(v) > 0 {
			if m, ok := v[0].(map[string]any); ok {
				decodeFields(m)
			}
		}
	case map[string]any:
		decodeFields(v)
	case string:
		r.Content = v
	}
	return r, nil
}
func ValidateRecord(r model.DNSRecord) error {
	switch r.Type {
	case "A":
		if net.ParseIP(r.Content) == nil || net.ParseIP(r.Content).To4() == nil {
			return errors.New("A record requires IPv4")
		}
	case "AAAA":
		if net.ParseIP(r.Content) == nil || net.ParseIP(r.Content).To4() != nil {
			return errors.New("AAAA record requires IPv6")
		}
	case "CNAME", "TXT", "MX", "NS", "SRV", "CAA":
	default:
		return errors.New("unsupported record type")
	}
	if r.Name == "" || strings.ContainsAny(r.Name, "\r\n\x00") {
		return errors.New("invalid DNS name")
	}
	if r.TTL != 1 && (r.TTL < 60 || r.TTL > 86400) {
		return errors.New("TTL must be automatic (1) or 60–86400 seconds")
	}
	if r.Proxied && r.Type != "A" && r.Type != "AAAA" && r.Type != "CNAME" {
		return errors.New("only A, AAAA and CNAME records support proxying")
	}
	return nil
}
func (d *DNSClient) Put(ctx context.Context, zone string, r model.DNSRecord) (model.DNSRecord, error) {
	if e := ValidateRecord(r); e != nil {
		return r, e
	}
	payload := map[string]any{}
	if len(r.Extra) > 0 {
		if e := json.Unmarshal(r.Extra, &payload); e != nil {
			return r, e
		}
	}
	original, _ := d.decode(r.Extra, zone)
	for _, k := range []string{"id", "zone_id", "zone_name", "created_on", "modified_on", "meta", "proxiable", "locked"} {
		delete(payload, k)
	}
	payload["name"] = r.Name
	payload["type"] = r.Type
	payload["ttl"] = r.TTL
	if d.Provider == "cloudflare" {
		payload["content"] = r.Content
		payload["proxied"] = r.Proxied
		if r.Priority != nil {
			payload["priority"] = *r.Priority
		}
		if len(r.Data) > 0 {
			payload["data"] = r.Data
		}
	} else {
		name := strings.TrimSuffix(r.Name, "."+zone)
		if r.Name == zone {
			name = "@"
		}
		payload["name"] = name
		payload["type"] = strings.ToLower(r.Type)
		payload["cloud"] = r.Proxied
		if r.TTL == 1 {
			payload["ttl"] = 120
		}
		if len(r.Data) > 0 {
			var value any
			if err := json.Unmarshal(r.Data, &value); err != nil {
				return r, errors.New("invalid ArvanCloud value JSON")
			}
			// A simple field edit must not silently lose to the provider JSON that
			// accompanied the listed record. Preserve weights and other values.
			if r.Content != original.Content || r.Priority != nil && (original.Priority == nil || *r.Priority != *original.Priority) {
				entry := value
				if values, ok := value.([]any); ok && len(values) > 0 {
					entry = values[0]
				}
				if fields, ok := entry.(map[string]any); ok {
					key := "host"
					switch r.Type {
					case "A", "AAAA":
						key = "ip"
					case "TXT":
						key = "text"
					case "CAA":
						key = "value"
					}
					if r.Content != original.Content {
						fields[key] = r.Content
					}
					if r.Priority != nil {
						fields["priority"] = *r.Priority
					}
				} else if _, ok := value.(string); ok {
					value = r.Content
				}
			}
			payload["value"] = value
		} else {
			switch r.Type {
			case "A", "AAAA":
				payload["value"] = []map[string]any{{"ip": r.Content}}
			case "TXT":
				payload["value"] = map[string]any{"text": r.Content}
			case "CNAME", "NS":
				payload["value"] = map[string]any{"host": r.Content}
			case "MX":
				p := 10
				if r.Priority != nil {
					p = *r.Priority
				}
				payload["value"] = map[string]any{"host": r.Content, "priority": p}
			default:
				return r, errors.New("ArvanCloud SRV/CAA records require provider value JSON in data")
			}
		}
	}
	method, path := "POST", d.recordPath(zone)
	if r.ID != "" {
		method = "PUT"
		path += "/" + url.PathEscape(r.ID)
	}
	var raw json.RawMessage
	if e := d.request(ctx, method, path, payload, &raw); e != nil {
		return r, e
	}
	return d.decode(raw, zone)
}
func (d *DNSClient) Delete(ctx context.Context, zone, id string) error {
	if id == "" {
		return errors.New("record ID required")
	}
	return d.request(ctx, "DELETE", d.recordPath(zone)+"/"+url.PathEscape(id), nil, nil)
}
func Matching(records []model.DNSRecord, name string) []model.DNSRecord {
	out := []model.DNSRecord{}
	for _, r := range records {
		if strings.EqualFold(strings.TrimSuffix(r.Name, "."), strings.TrimSuffix(name, ".")) {
			out = append(out, r)
		}
	}
	return out
}
