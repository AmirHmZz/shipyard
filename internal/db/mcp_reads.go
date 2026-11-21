package db

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

// Scope is resolved from the current application ancestry, inside the same
// query as the protected data. A moved app follows its new project immediately.
const mcpScope = `WITH scoped_apps AS (
	SELECT a.id,a.name,env.id AS environment_id,env.name AS environment_name,
		p.id AS project_id,p.name AS project_name,a.data->>'workload' AS workload
	FROM mcp_tokens AS token JOIN mcp_token_projects AS scope ON scope.token_id=token.id
	JOIN resources p ON p.id=scope.project_id AND p.kind='project'
	JOIN resources env ON env.parent_id=p.id AND env.kind='environment' AND env.team_id=p.team_id
	JOIN resources a ON a.parent_id=env.id AND a.kind='application' AND a.team_id=p.team_id
	WHERE token.id=$1 AND token.revoked_at IS NULL AND token.expires_at>now()
)`

type MCPApplication struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ProjectID     string `json:"projectId"`
	ProjectName   string `json:"projectName"`
	EnvironmentID string `json:"environmentId"`
	Environment   string `json:"environmentName"`
	Type          string `json:"type"`
	DashboardURL  string `json:"dashboardUrl"`
}

type MCPApplicationFilter struct {
	ProjectID, ProjectName, EnvironmentID, EnvironmentName, Name, After string
	Limit                                                               int
}

func (s *Store) MCPApplications(ctx context.Context, token string, f MCPApplicationFilter) ([]MCPApplication, error) {
	rows, err := s.Pool.Query(ctx, mcpScope+`
		SELECT id,name,project_id,project_name,environment_id,environment_name,CASE WHEN workload='job' THEN 'job' ELSE 'application' END
		FROM scoped_apps WHERE ($2='' OR project_id=$2) AND ($3='' OR environment_id=$3)
		AND ($4='' OR strpos(lower(name),lower($4))>0)
		AND ($5='' OR lower(project_name)=lower($5)) AND ($6='' OR lower(environment_name)=lower($6))
		AND id>$7 ORDER BY id LIMIT $8`,
		token, f.ProjectID, f.EnvironmentID, f.Name, f.ProjectName, f.EnvironmentName, f.After, f.Limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (MCPApplication, error) {
		var item MCPApplication
		err := row.Scan(&item.ID, &item.Name, &item.ProjectID, &item.ProjectName, &item.EnvironmentID, &item.Environment, &item.Type)
		return item, err
	})
}

type MCPRun struct {
	ID           string       `json:"id"`
	AppID        string       `json:"applicationId"`
	ProjectID    string       `json:"projectId"`
	Status       string       `json:"status"`
	Commit       *string      `json:"commit,omitempty"`
	CreatedAt    time.Time    `json:"createdAt"`
	UpdatedAt    *time.Time   `json:"updatedAt,omitempty"`
	FinishedAt   *time.Time   `json:"finishedAt,omitempty"`
	Attempts     []MCPAttempt `json:"attempts,omitempty"`
	DashboardURL string       `json:"dashboardUrl"`
}

type MCPAttempt struct {
	Number       int        `json:"number"`
	Status       string     `json:"status"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	FinishedAt   *time.Time `json:"finishedAt,omitempty"`
	ExitCode     *int       `json:"exitCode,omitempty"`
	LogsComplete bool       `json:"logsComplete"`
}

type MCPRunFilter struct {
	ProjectID, AppID, Status string
	Since, Until             *time.Time
	Before                   *time.Time
	BeforeID                 string
	Limit                    int
}

func (s *Store) MCPRuns(ctx context.Context, token string, job bool, f MCPRunFilter) ([]MCPRun, error) {
	table, fields := "deployments", "r.commit_sha,r.updated_at,NULL,NULL"
	if job {
		table, fields = "job_runs", `NULL,NULL,r.finished_at,(SELECT jsonb_agg(jsonb_build_object(
			'number',a.number,'status',a.state,'startedAt',a.started_at,'finishedAt',a.finished_at,
			'exitCode',a.exit_code,'logsComplete',a.logs_complete) ORDER BY a.number) FROM job_attempts a WHERE a.run_id=r.id)`
	}
	rows, err := s.Pool.Query(ctx, mcpScope+`
		SELECT r.id,r.app_id,app.project_id,r.state,r.created_at,`+fields+`
		FROM `+table+` r JOIN scoped_apps app ON app.id=r.app_id
		WHERE ($2='' OR app.project_id=$2) AND ($3='' OR r.app_id=$3) AND ($4='' OR r.state=$4)
		AND ($5::timestamptz IS NULL OR r.created_at >= $5) AND ($6::timestamptz IS NULL OR r.created_at < $6)
		AND ($7::timestamptz IS NULL OR (r.created_at,r.id)<($7,$8))
		ORDER BY r.created_at DESC,r.id DESC LIMIT $9`, token, f.ProjectID, f.AppID, f.Status,
		f.Since, f.Until, f.Before, f.BeforeID, f.Limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (MCPRun, error) {
		var item MCPRun
		var attempts []byte
		err := row.Scan(&item.ID, &item.AppID, &item.ProjectID, &item.Status, &item.CreatedAt, &item.Commit,
			&item.UpdatedAt, &item.FinishedAt, &attempts)
		if err == nil && attempts != nil {
			err = json.Unmarshal(attempts, &item.Attempts)
		}
		return item, err
	})
}

type MCPLogLine struct {
	ID        int64     `json:"id"`
	Source    string    `json:"source"`
	SourceID  string    `json:"sourceId"`
	AppID     string    `json:"applicationId"`
	Attempt   *int      `json:"attempt,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	Message   string    `json:"message"`
}

type MCPLogPage struct {
	AppID       string
	CaptureOpen bool
	Entries     []MCPLogLine
}

func (s *Store) MCPReadLogs(ctx context.Context, token, app, id string, job bool, attempt *int, after int64, limit int) (MCPLogPage, error) {
	var result MCPLogPage
	tx, err := s.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	parentSQL := `SELECT d.app_id,d.state NOT IN ('healthy','failed','recovery_failed','cancelled')
		FROM deployments d JOIN scoped_apps a ON a.id=d.app_id WHERE d.id=$2`
	logSQL := `SELECT id,'deployment',deployment_id,$4::text,NULL::integer,created_at,message
		FROM events WHERE deployment_id=$1 AND id>$2 AND $5::int IS NULL ORDER BY id LIMIT $3`
	args := []any{token, id}
	if job {
		parentSQL = `SELECT r.app_id, CASE WHEN $4::int IS NULL THEN (
			r.state IN ` + ActiveJobStates + ` OR EXISTS(SELECT 1 FROM job_attempts a WHERE a.run_id=r.id AND NOT a.logs_complete)
		) ELSE EXISTS(SELECT 1 FROM job_attempts a WHERE a.run_id=r.id AND a.number=$4 AND NOT a.logs_complete) END
			FROM job_runs r JOIN scoped_apps app ON app.id=r.app_id WHERE r.id=$2 AND r.app_id=$3
			AND ($4::int IS NULL OR EXISTS(SELECT 1 FROM job_attempts a WHERE a.run_id=r.id AND a.number=$4))`
		logSQL = `SELECT id,'job',run_id,$4::text,attempt,created_at,message FROM job_run_events
			WHERE run_id=$1 AND id>$2 AND ($5::int IS NULL OR attempt=$5) ORDER BY id LIMIT $3`
		args = append(args, app, attempt)
	}
	if err := tx.QueryRow(ctx, mcpScope+parentSQL, args...).Scan(&result.AppID, &result.CaptureOpen); err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, logSQL, id, after, limit, result.AppID, attempt)
	if err != nil {
		return result, err
	}
	result.Entries, err = pgx.CollectRows(rows, scanMCPLogLine)
	if err != nil {
		return result, err
	}
	return result, tx.Commit(ctx)
}

type MCPSearchFilter struct {
	ProjectID, AppID, Text string
	Since, Until           time.Time
	Before                 *time.Time
	BeforeSource           string
	BeforeID               int64
	Limit                  int
}

func (s *Store) MCPSearch(ctx context.Context, token string, f MCPSearchFilter) ([]MCPLogLine, error) {
	rows, err := s.Pool.Query(ctx, mcpScope+`, match_apps AS (
		SELECT id FROM scoped_apps WHERE ($2='' OR project_id=$2) AND ($3='' OR id=$3)
	), log_lines AS (
		SELECT e.id,'deployment'::text AS source,d.id AS source_id,d.app_id,NULL::integer AS attempt,e.created_at,e.message
		FROM events e JOIN deployments d ON d.id=e.deployment_id JOIN match_apps a ON a.id=d.app_id
		WHERE e.created_at >= $5 AND e.created_at < $6 AND strpos(lower(e.message),lower($4))>0
		UNION ALL
		SELECT e.id,'job',r.id,r.app_id,e.attempt,e.created_at,e.message
		FROM job_run_events e JOIN job_runs r ON r.id=e.run_id JOIN match_apps a ON a.id=r.app_id
		WHERE e.created_at >= $5 AND e.created_at < $6 AND strpos(lower(e.message),lower($4))>0
	)
	SELECT id,source,source_id,app_id,attempt,created_at,message FROM log_lines
	WHERE ($7::timestamptz IS NULL OR (created_at,source,id)<($7,$8,$9))
	ORDER BY created_at DESC,source DESC,id DESC LIMIT $10`,
		token, f.ProjectID, f.AppID, f.Text, f.Since, f.Until, f.Before, f.BeforeSource, f.BeforeID, f.Limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanMCPLogLine)
}

func scanMCPLogLine(row pgx.CollectableRow) (MCPLogLine, error) {
	var line MCPLogLine
	err := row.Scan(&line.ID, &line.Source, &line.SourceID, &line.AppID, &line.Attempt, &line.CreatedAt, &line.Message)
	return line, err
}

func (s *Store) MCPCheckApplication(ctx context.Context, token, app string) error {
	var id string
	return s.Pool.QueryRow(ctx, mcpScope+" SELECT id FROM scoped_apps WHERE id=$2", token, app).Scan(&id)
}
