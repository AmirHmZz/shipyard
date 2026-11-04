package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
)

var ErrZoneGrant = errors.New("invalid hostname grant")

type ZoneGrant struct {
	Mode     string   `json:"mode"`
	Patterns []string `json:"patterns"`
}

type TeamZoneGrant struct {
	TeamID string `json:"teamId"`
	ZoneGrant
}

type ZoneAccess struct {
	ZoneID string `json:"zoneId"`
	Domain string `json:"domain"`
	ZoneGrant
}

func zoneGrant(patterns []string) ZoneGrant {
	if len(patterns) == 0 {
		return ZoneGrant{Mode: "whole", Patterns: []string{}}
	}
	return ZoneGrant{Mode: "scoped", Patterns: patterns}
}

func (g ZoneGrant) covers(hostname string) bool {
	if g.Mode == "whole" {
		return true
	}
	return slices.ContainsFunc(g.Patterns, func(pattern string) bool {
		return model.HostnamePatternCovers(pattern, hostname)
	})
}

func normalizeZoneGrant(domain string, grant ZoneGrant) (ZoneGrant, error) {
	switch grant.Mode {
	case "none", "whole":
		if len(grant.Patterns) != 0 {
			return ZoneGrant{}, fmt.Errorf("%w: patterns require scoped access", ErrZoneGrant)
		}
		grant.Patterns = []string{}
	case "scoped":
		if len(grant.Patterns) == 0 {
			return ZoneGrant{}, fmt.Errorf("%w: enter at least one hostname pattern", ErrZoneGrant)
		}
		patterns := make([]string, 0, len(grant.Patterns))
		for _, raw := range grant.Patterns {
			pattern, err := model.Domain(raw)
			if err != nil || !model.HostnameWithinZone(pattern, domain) {
				return ZoneGrant{}, fmt.Errorf("%w: %q must be a hostname or wildcard in %s", ErrZoneGrant, raw, domain)
			}
			patterns = append(patterns, pattern)
		}
		slices.Sort(patterns)
		grant.Patterns = slices.Compact(patterns)
	default:
		return ZoneGrant{}, fmt.Errorf("%w: choose none, whole, or scoped access", ErrZoneGrant)
	}
	return grant, nil
}

func (s *Store) ZoneGrants(ctx context.Context, zone string) ([]TeamZoneGrant, error) {
	rows, err := s.Pool.Query(ctx, `SELECT team_id,hostname_patterns FROM resource_grants WHERE resource_id=$1 ORDER BY team_id`, zone)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	grants := []TeamZoneGrant{}
	for rows.Next() {
		var team string
		var patterns []string
		if err = rows.Scan(&team, &patterns); err != nil {
			return nil, err
		}
		grants = append(grants, TeamZoneGrant{TeamID: team, ZoneGrant: zoneGrant(patterns)})
	}
	return grants, rows.Err()
}

func (s *Store) TeamZoneAccess(ctx context.Context, team string) ([]ZoneAccess, error) {
	rows, err := s.Pool.Query(ctx, `SELECT z.id,z.data->>'domain',g.hostname_patterns FROM resource_grants g
		JOIN resources z ON z.id=g.resource_id WHERE g.team_id=$1 AND z.kind='zone'
		AND z.data->>'deleting' IS DISTINCT FROM 'true' ORDER BY z.data->>'domain',z.id`, team)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	zones := []ZoneAccess{}
	for rows.Next() {
		var zone ZoneAccess
		var patterns []string
		if err = rows.Scan(&zone.ZoneID, &zone.Domain, &patterns); err != nil {
			return nil, err
		}
		zone.ZoneGrant = zoneGrant(patterns)
		zones = append(zones, zone)
	}
	return zones, rows.Err()
}

type zoneGrantReader interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func requireZoneHostname(ctx context.Context, db zoneGrantReader, team, zone, requested string) error {
	name, err := model.Domain(requested)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrZoneGrant, err)
	}
	var domain string
	var patterns []string
	err = db.QueryRow(ctx, `SELECT z.data->>'domain',g.hostname_patterns FROM resource_grants g
		JOIN resources z ON z.id=g.resource_id WHERE g.resource_id=$1 AND g.team_id=$2
		AND z.kind='zone' AND z.data->>'deleting' IS DISTINCT FROM 'true'`, zone, team).Scan(&domain, &patterns)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && (!model.HostnameWithinZone(name, domain) || !zoneGrant(patterns).covers(name))) {
		return fmt.Errorf("%w: %s is outside the team's access for the selected DNS zone", ErrZoneGrant, name)
	}
	return err
}

func (s *Store) RequireZoneHostname(ctx context.Context, team, zone, requested string) error {
	return requireZoneHostname(ctx, s.Pool, team, zone, requested)
}

func (s *Store) RequireRouteZoneAccess(ctx context.Context, resource model.Resource) error {
	route, err := model.Decode[model.Route](resource)
	if err != nil || route.ZoneID == "" {
		return err
	}
	_, err = requireRouteZoneAccess(ctx, s.Pool, resource.TeamID, resource.ParentID, route)
	return err
}

func requireRouteZoneAccess(ctx context.Context, q zoneGrantReader, team, parentID string, route model.Route) (model.App, error) {
	var parent model.App
	if err := requireZoneHostname(ctx, q, team, route.ZoneID, route.Domain); err != nil {
		return parent, err
	}
	err := q.QueryRow(ctx, "SELECT data FROM resources WHERE id=$1 AND kind='application'", parentID).Scan(&parent)
	if err != nil {
		return parent, err
	}
	// Generated routes use the preview wildcard for certificate issuance.
	wildcard := parent.PreviewDomain
	if parent.PreviewOf != "" && strings.HasPrefix(wildcard, "*.") && model.HostnamePatternCovers(wildcard, route.Domain) {
		err = requireZoneHostname(ctx, q, team, route.ZoneID, wildcard)
	}
	return parent, err
}

func (s *Store) DeleteZone(ctx context.Context, id string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	var used bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM resources
		WHERE data->>'zoneId'=$1 OR data->>'previewZoneId'=$1)`, id).Scan(&used)
	if err != nil {
		return err
	}
	if used {
		return fmt.Errorf("%w: zone is still referenced by an application or route", ErrConflict)
	}
	if _, err = tx.Exec(ctx, "DELETE FROM resources WHERE id=$1 AND kind='zone'", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) SetZoneGrant(ctx context.Context, actor, zone, team string, input ZoneGrant, legacy bool) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// The resource save path uses the same lock for route and preview writes.
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	var domain string
	err = tx.QueryRow(ctx, `SELECT data->>'domain' FROM resources WHERE id=$1 AND kind='zone'
		AND data->>'deleting' IS DISTINCT FROM 'true'`, zone).Scan(&domain)
	if err != nil {
		return err
	}
	var teamExists bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE id=$1 AND kind='team')", team).Scan(&teamExists); err != nil {
		return err
	}
	if !teamExists {
		return fmt.Errorf("%w: team not found", ErrZoneGrant)
	}
	next, err := normalizeZoneGrant(domain, input)
	if err != nil {
		return err
	}
	var patterns []string
	err = tx.QueryRow(ctx, "SELECT hostname_patterns FROM resource_grants WHERE resource_id=$1 AND team_id=$2", zone, team).Scan(&patterns)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		return err
	default:
		before := zoneGrant(patterns)
		if legacy && before.Mode == "scoped" {
			return fmt.Errorf("%w: use zone access settings to change a scoped grant", ErrConflict)
		}
		if next.Mode != "whole" {
			if err := checkZoneGrantDependencies(ctx, tx, zone, team, before, next); err != nil {
				return err
			}
		}
	}
	if next.Mode == "none" {
		_, err = tx.Exec(ctx, "DELETE FROM resource_grants WHERE resource_id=$1 AND team_id=$2", zone, team)
	} else {
		_, err = tx.Exec(ctx, `INSERT INTO resource_grants(resource_id,team_id,hostname_patterns) VALUES($1,$2,$3)
			ON CONFLICT(resource_id,team_id) DO UPDATE SET hostname_patterns=EXCLUDED.hostname_patterns`, zone, team, next.Patterns)
	}
	if err != nil {
		return err
	}
	detail, err := json.Marshal(next)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO audit(user_id,action,resource_id,team_id,detail) VALUES($1,'resource.grant',$2,$3,$4)", actor, zone, team, detail); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func checkZoneGrantDependencies(ctx context.Context, tx pgx.Tx, zone, team string, before, next ZoneGrant) error {
	rows, err := tx.Query(ctx, `SELECT 'route',r.data->>'domain',COALESCE(p.data->>'previewDomain','') FROM resources r
		LEFT JOIN resources p ON p.id=r.parent_id AND COALESCE(p.data->>'previewOf','')<>''
		WHERE r.kind='route' AND r.team_id=$2 AND r.data->>'zoneId'=$1
		UNION ALL SELECT 'public preview',data->>'previewDomain','' FROM resources
		WHERE kind='application' AND team_id=$2 AND data->>'previewZoneId'=$1
		AND data->>'previews'='true' AND COALESCE(data->>'previewOf','')=''
		AND data->'previewRouting'->>'mode' IS DISTINCT FROM 'private'
		ORDER BY 1,2`, zone, team)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var kind, raw, wildcard string
		if err = rows.Scan(&kind, &raw, &wildcard); err != nil {
			return err
		}
		name, err := model.Domain(raw)
		if err != nil {
			return fmt.Errorf("%w: fix invalid %s hostname %q before changing this grant", ErrConflict, kind, raw)
		}
		if before.covers(name) && !next.covers(name) {
			return fmt.Errorf("%w: %s %s still uses this grant", ErrConflict, kind, name)
		}
		if strings.HasPrefix(wildcard, "*.") && model.HostnamePatternCovers(wildcard, name) && before.covers(wildcard) && !next.covers(wildcard) {
			return fmt.Errorf("%w: preview route %s still uses %s for its certificate", ErrConflict, name, wildcard)
		}
	}
	return rows.Err()
}

func checkResourceZoneAccess(ctx context.Context, tx pgx.Tx, id string, old model.Resource, in model.ResourceInput) error {
	switch in.Kind {
	case "application":
		app, err := model.Decode[model.App](model.Resource{Data: in.Data})
		if err != nil {
			return err
		}
		if app.UsesPublicPreviewDomain() {
			return requireZoneHostname(ctx, tx, in.TeamID, app.PreviewZoneID, app.PreviewDomain)
		}
	case "route":
		route, err := model.Decode[model.Route](model.Resource{Data: in.Data})
		if err != nil || route.ZoneID == "" {
			return err
		}
		parent, err := requireRouteZoneAccess(ctx, tx, in.TeamID, in.ParentID, route)
		if err != nil {
			return err
		}
		return checkRouteConflict(ctx, tx, id, parent.ServerID, route)
	case "zone":
		if old.ID == "" {
			return nil
		}
		before, err := model.Decode[model.Zone](old)
		if err != nil {
			return err
		}
		next, err := model.Decode[model.Zone](model.Resource{Data: in.Data})
		if err != nil {
			return err
		}
		if before != next {
			var inUse bool
			err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM resource_grants WHERE resource_id=$1
				UNION ALL SELECT 1 FROM resources WHERE kind='route' AND data->>'zoneId'=$1)`, old.ID).Scan(&inUse)
			if err != nil {
				return err
			}
			if inUse {
				return fmt.Errorf("%w: connect a new DNS zone to change the provider zone of a zone in use", ErrConflict)
			}
		}
	}
	return nil
}

func checkRouteConflict(ctx context.Context, tx pgx.Tx, id, server string, candidate model.Route) error {
	rows, err := tx.Query(ctx, `SELECT r.data,COALESCE(p.data->>'serverId','') FROM resources r
		JOIN resources p ON p.id=r.parent_id WHERE r.kind='route' AND r.id<>$1`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	name, _ := model.Domain(candidate.Domain)
	for rows.Next() {
		var existing model.Route
		var otherServer string
		if err = rows.Scan(&existing, &otherServer); err != nil {
			return err
		}
		if candidate.Protocol == "tcp" && existing.Protocol == "tcp" && server == otherServer && candidate.ListenPort == existing.ListenPort {
			return fmt.Errorf("%w: TCP listener port is already assigned", ErrConflict)
		}
		otherName, _ := model.Domain(existing.Domain)
		if name != "" && name == otherName {
			if server != otherServer {
				return fmt.Errorf("%w: hostname is already assigned to another server", ErrConflict)
			}
			if candidate.Protocol != "tcp" && existing.Protocol != "tcp" {
				return fmt.Errorf("%w: hostname is already assigned", ErrConflict)
			}
		}
	}
	return rows.Err()
}
