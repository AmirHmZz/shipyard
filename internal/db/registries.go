package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
)

// MigrateRegistries decrypts only after checkKey. A single transaction ensures
// credentials and grants exist before any legacy value is removed.
func (s *Store) MigrateRegistries(ctx context.Context) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, "SELECT "+resourceColumns+" FROM resources WHERE kind IN ('registry','application') ORDER BY kind DESC,id")
	if err != nil {
		return err
	}
	var resources []model.Resource
	for rows.Next() {
		r, e := scanResource(rows)
		if e != nil {
			rows.Close()
			return e
		}
		resources = append(resources, r)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	type connection struct {
		id   string
		spec model.Registry
	}
	connections := map[string]connection{}
	for _, r := range resources {
		if r.Kind != "registry" {
			continue
		}
		spec, e := model.Decode[model.Registry](r)
		if e != nil {
			return e
		}
		values, e := s.Secrets(r)
		if e != nil {
			return e
		}
		host, e := model.RegistryHostname(spec.Hostname)
		if e != nil {
			return e
		}
		connections[host+"\x00"+spec.Username+"\x00"+values["password"]] = connection{r.ID, spec}
	}
	for _, r := range resources {
		if r.Kind != "application" {
			continue
		}
		spec, e := model.Decode[model.App](r)
		if e != nil {
			return e
		}
		values, e := s.Secrets(r)
		if e != nil {
			return e
		}
		if spec.Registry == "" {
			continue
		}
		host, e := model.RegistryHostname(spec.Registry)
		if e != nil {
			return fmt.Errorf("migrate registry for application %s: %w", r.ID, e)
		}
		if spec.RegistryUser == "" || values["registry_password"] == "" {
			return fmt.Errorf("incomplete registry credentials for application %s", r.ID)
		}
		key := host + "\x00" + spec.RegistryUser + "\x00" + values["registry_password"]
		conn, ok := connections[key]
		if !ok {
			conn = connection{id: uuid.NewString(), spec: model.Registry{Hostname: host, Username: spec.RegistryUser}}
			raw, _ := json.Marshal(conn.spec)
			secret, _ := json.Marshal(map[string]string{"password": values["registry_password"]})
			sealed, e := s.Vault.Seal(secret, "resource:"+conn.id)
			if e != nil {
				return e
			}
			if _, e = tx.Exec(ctx, "INSERT INTO resources(id,kind,name,data,secret) VALUES($1,'registry',$2,$3,$4)", conn.id, host, raw, sealed); e != nil {
				return e
			}
			connections[key] = conn
		}
		if e = registryGrant(ctx, tx, conn.id, r.TeamID, host); e != nil {
			return e
		}
		delete(values, "registry_password")
		secret, _ := json.Marshal(values)
		sealed, e := s.Vault.Seal(secret, "resource:"+r.ID)
		if e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, "UPDATE resources SET data=data-'registry'-'registryUser',secret=$2,version=version+1,updated_at=now() WHERE id=$1", r.ID, sealed); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}

func registryGrant(ctx context.Context, tx pgx.Tx, id, team, host string) error {
	var conflict bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM resources r JOIN resource_grants g ON g.resource_id=r.id WHERE r.kind='registry' AND r.id<>$1 AND g.team_id=$2 AND r.data->>'hostname'=$3)`, id, team, host).Scan(&conflict); err != nil {
		return err
	}
	if conflict {
		return fmt.Errorf("%w: a registry for %s is already granted to this team", ErrConflict, host)
	}
	_, err := tx.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2) ON CONFLICT DO NOTHING", id, team)
	return err
}

func (s *Store) GrantRegistry(ctx context.Context, id, team string, granted bool) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	var host string
	if err = tx.QueryRow(ctx, "SELECT data->>'hostname' FROM resources WHERE id=$1 AND kind='registry'", id).Scan(&host); err != nil {
		return err
	}
	if granted {
		err = registryGrant(ctx, tx, id, team, host)
	} else {
		_, err = tx.Exec(ctx, "DELETE FROM resource_grants WHERE resource_id=$1 AND team_id=$2", id, team)
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) RegistryCredentials(ctx context.Context, team string) (map[string]model.RegistryCredential, error) {
	rows, err := s.Pool.Query(ctx, "SELECT "+resourceColumns+" FROM resources WHERE kind='registry' AND id IN (SELECT resource_id FROM resource_grants WHERE team_id=$1) AND COALESCE(data->>'deleting','false')<>'true'", team)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]model.RegistryCredential{}
	for rows.Next() {
		r, e := scanResource(rows)
		if e != nil {
			return nil, e
		}
		spec, e := model.Decode[model.Registry](r)
		if e != nil {
			return nil, e
		}
		values, e := s.Secrets(r)
		if e != nil {
			return nil, e
		}
		if _, ok := out[spec.Hostname]; ok {
			return nil, errors.New("multiple registry credentials for the same hostname")
		}
		out[spec.Hostname] = model.RegistryCredential{Username: spec.Username, Password: values["password"]}
	}
	return out, rows.Err()
}
