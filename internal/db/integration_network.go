package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// DeleteIntegration shares the resource-tree lock with Save and policy writes,
// so an integration cannot disappear between reference validation and commit.
func (s *Store) DeleteIntegration(ctx context.Context, id string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT name FROM resources WHERE data->>'proxyId'=$1
 UNION ALL SELECT 'Certificate issuance' WHERE EXISTS(SELECT 1 FROM settings WHERE key='certificate-network' AND value->>'proxyId'=$1)
 UNION ALL SELECT 'Monitoring default policies' WHERE EXISTS(SELECT 1 FROM settings WHERE key='monitoring-defaults' AND ((value->'server'->'destinations') ? $1 OR (value->'application'->'destinations') ? $1))
 UNION ALL SELECT r.name||' monitoring policy' FROM monitoring_policies p JOIN resources r ON r.id=p.resource_id WHERE p.data->'policy'->'destinations' ? $1`, id)
	if err != nil {
		return err
	}
	names := []string{}
	for rows.Next() {
		var name string
		if err = rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		names = append(names, name)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if len(names) > 0 {
		return fmt.Errorf("%w: used by %s", ErrConflict, strings.Join(names, ", "))
	}
	_, err = tx.Exec(ctx, "DELETE FROM resources WHERE id=$1", id)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type CertificateNetwork struct {
	ProxyID string `json:"proxyId"`
}

func (s *Store) CertificateNetwork(ctx context.Context) (CertificateNetwork, error) {
	var v CertificateNetwork
	var raw []byte
	err := s.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key='certificate-network'").Scan(&raw)
	if err != nil {
		return v, err
	}
	err = json.Unmarshal(raw, &v)
	return v, err
}
func (s *Store) SetCertificateNetwork(ctx context.Context, v CertificateNetwork) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	if v.ProxyID != "" {
		var yes bool
		if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE id=$1 AND kind='proxy')", v.ProxyID).Scan(&yes); err != nil {
			return err
		}
		if !yes {
			return errors.New("selected proxy is unavailable")
		}
	}
	raw, _ := json.Marshal(v)
	_, err = tx.Exec(ctx, "INSERT INTO settings(key,value) VALUES('certificate-network',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", raw)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
