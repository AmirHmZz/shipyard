package api

import (
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"net/http"
	"shipyard/internal/control"
	"time"
)

// CertificateSummary contains public certificate metadata only. Bundles also
// contain private keys and must never be serialized into API responses.
type CertificateSummary struct {
	OwnerType         string     `json:"ownerType"`
	RouteID           string     `json:"routeId"`
	ApplicationID     string     `json:"applicationId"`
	Domain            string     `json:"domain"`
	CertificateDomain string     `json:"certificateDomain"`
	Status            string     `json:"status"`
	HasCertificate    bool       `json:"hasCertificate"`
	Issuer            string     `json:"issuer"`
	Names             []string   `json:"names"`
	ValidFrom         *time.Time `json:"validFrom"`
	ExpiresAt         *time.Time `json:"expiresAt"`
	RenewalAt         *time.Time `json:"renewalAt"`
	SerialNumber      string     `json:"serialNumber"`
	Fingerprint       string     `json:"fingerprint"`
	Authority         string     `json:"authority"`
	Error             string     `json:"error"`
}

func certificateMetadata(summary *CertificateSummary, bundle []byte) bool {
	for len(bundle) > 0 {
		block, rest := pem.Decode(bundle)
		if block == nil {
			break
		}
		bundle = rest
		if block.Type != "CERTIFICATE" {
			continue
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return false
		}
		summary.HasCertificate = true
		summary.Issuer = cert.Issuer.String()
		summary.Names = append([]string{}, cert.DNSNames...)
		summary.ValidFrom = &cert.NotBefore
		summary.ExpiresAt = &cert.NotAfter
		renewal := cert.NotAfter.Add(-30 * 24 * time.Hour)
		summary.RenewalAt = &renewal
		summary.SerialNumber = cert.SerialNumber.Text(16)
		fingerprint := sha256.Sum256(cert.Raw)
		summary.Fingerprint = hex.EncodeToString(fingerprint[:])
		return true
	}
	return false
}

func (a *API) zoneCertificates(w http.ResponseWriter, r *http.Request) {
	zone, ok := a.get(w, r, false)
	if !ok {
		return
	}
	if zone.Kind != "zone" {
		fail(w, 400, "DNS zone required")
		return
	}
	rows, err := a.Store.Pool.Query(r.Context(), `SELECT route_id,domain,certificate_domain,certificate_state,expires_at,certificate_ca,last_error,certificate FROM domain_state WHERE zone_id=$1 ORDER BY domain,route_id`, zone.ID)
	if err != nil {
		a.err(w, err)
		return
	}
	type stored struct {
		metadata  CertificateSummary
		encrypted []byte
	}
	var entries []stored
	for rows.Next() {
		var entry stored
		s := &entry.metadata
		if err = rows.Scan(&s.RouteID, &s.Domain, &s.CertificateDomain, &s.Status, &s.ExpiresAt, &s.Authority, &s.Error, &entry.encrypted); err != nil {
			break
		}
		entries = append(entries, entry)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		a.err(w, err)
		return
	}
	out := []CertificateSummary{}
	for _, entry := range entries {
		route, err := a.Store.Resource(r.Context(), entry.metadata.RouteID)
		if err != nil {
			a.err(w, err)
			return
		}
		if !a.Store.Access(r.Context(), user(r), route, false) {
			continue
		}
		s := entry.metadata
		s.ApplicationID = route.ParentID
		s.OwnerType = "application"
		if route.ParentID == control.DashboardID {
			s.OwnerType = "dashboard"
			s.ApplicationID = ""
		}
		s.Names = []string{}
		if len(entry.encrypted) > 0 {
			bundle, err := a.Store.Vault.Open(entry.encrypted, "certificate:"+s.RouteID)
			if err != nil || !certificateMetadata(&s, bundle) {
				s.Error = "Stored certificate metadata could not be read"
			}
		}
		out = append(out, s)
	}
	respond(w, 200, out)
}
