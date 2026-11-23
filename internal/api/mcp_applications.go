package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"shipyard/internal/db"
	"shipyard/internal/model"
)

func (a *API) addMCPApplicationTools(server *mcp.Server) {
	registerMCPTool(a, server, "list_application_options", "List environments and granted deployment bindings for a project.", true, a.mcpAppOptions, nil)
	registerMCPTool(a, server, "get_application", "Read saved application configuration, versions, routes and available permissions.", true, a.mcpAppDetails, nil)
	registerMCPTool(a, server, "create_application", "Create a Service or Job application. Supply a request UUID and the environment ID.", false, a.mcpCreateApp, func(in mcpCreateAppInput) string { return in.EnvironmentID })
	registerMCPTool(a, server, "update_application_settings", "Save one application configuration section using its dashboard fields and current version where applicable.", false, a.mcpAppSettings, func(in mcpAppSettingsInput) string { return in.ApplicationID })
	registerMCPTool(a, server, "manage_application_route", "Create, update or sync an application route.", false, a.mcpAppRoute, func(in mcpAppRouteInput) string { return in.ApplicationID })
	registerMCPTool(a, server, "deploy_application", "Queue the normal deployment of the saved application source. Reuse requestId when retrying.", false, a.mcpDeployApp, func(in mcpDeployAppInput) string { return in.ApplicationID })
	registerMCPTool(a, server, "fresh_deploy_application", "Queue a Fresh deploy that deletes and recreates application volumes. Requires exact application name and current version.", false, a.mcpFreshApp, func(in mcpFreshAppInput) string { return in.ApplicationID })
	registerMCPTool(a, server, "control_application", "Start, stop, restart, roll back, approve an exact preview commit, or start or cancel a Job run.", false, a.mcpControlApp, func(in mcpControlAppInput) string { return in.ApplicationID })
	registerMCPTool(a, server, "delete_application_resources", "Delete an application, its route, a retained deployment, or eligible Job run history.", false, a.mcpCleanupApp, func(in mcpCleanupAppInput) string { return in.ApplicationID })
}

type mcpAppOptionsInput struct {
	ProjectID string `json:"projectId"`
	Limit     int    `json:"limit,omitempty"`
	Cursor    string `json:"cursor,omitempty"`
}

func (a *API) mcpAppOptions(ctx context.Context, hash string, in mcpAppOptionsInput) (mcpPage[db.MCPApplicationOption], error) {
	var out mcpPage[db.MCPApplicationOption]
	if uuid.Validate(in.ProjectID) != nil {
		return out, mcpInputError("Invalid project ID")
	}
	limit, err := mcpLimit(in.Limit, 50)
	if err != nil {
		return out, err
	}
	cursor, err := parseMCPCursor(in.Cursor)
	if err != nil {
		return out, err
	}
	rows, err := a.Store.MCPApplicationOptions(ctx, hash, in.ProjectID, cursor.Key, limit+1)
	if err != nil {
		return out, err
	}
	return mcpPageOf(rows, limit, func(row db.MCPApplicationOption) mcpCursor { return mcpCursor{Key: row.ID} }), nil
}

type mcpAppDetailsInput struct {
	ApplicationID string `json:"applicationId"`
	Section       string `json:"section,omitempty" jsonschema:"Optional section: automation, jobSchedule, limits, networking, publishedPorts, monitoring, runtime, releases, volumes, services, or metrics"`
}

type mcpAppDetailsOutput struct {
	Application  map[string]any    `json:"application"`
	Permissions  []string          `json:"permissions"`
	Routes       []mcpRouteDetails `json:"routes"`
	Settings     any               `json:"settings,omitempty"`
	DashboardURL string            `json:"dashboardUrl"`
}

type mcpRouteDetails struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	Version  int         `json:"version"`
	Settings model.Route `json:"settings"`
}

func (a *API) mcpAppDetails(ctx context.Context, hash string, in mcpAppDetailsInput) (mcpAppDetailsOutput, error) {
	var out mcpAppDetailsOutput
	if uuid.Validate(in.ApplicationID) != nil {
		return out, mcpInputError("Invalid application ID")
	}
	app, permissions, err := a.Store.MCPApplicationDetails(ctx, hash, in.ApplicationID)
	if err != nil {
		return out, err
	}
	data, err := model.Decode[model.App](app)
	if err != nil {
		return out, err
	}
	out.Application = map[string]any{"id": app.ID, "name": app.Name, "environmentId": app.ParentID,
		"version": app.Version, "data": data, "variables": app.Variables, "secretKeys": app.SecretKeys,
		"logoUrl": app.LogoURL, "sortOrder": app.SortOrder, "deleting": model.IsDeleting(app)}
	out.Permissions = permissions
	out.DashboardURL = mcpDashboardURL(a.canonicalOrigin(ctx), app.ID, "", "", "")
	out.Routes = []mcpRouteDetails{}
	routes, err := a.Store.Children(ctx, app.ID, "route")
	if err != nil {
		return out, err
	}
	for _, route := range routes {
		settings, err := model.Decode[model.Route](route)
		if err != nil {
			return out, err
		}
		out.Routes = append(out.Routes, mcpRouteDetails{route.ID, route.Name, route.Version, settings})
	}
	if in.Section != "" {
		readers := map[string]http.HandlerFunc{
			"automation": a.automation, "jobSchedule": a.jobSettings, "limits": a.resourceLimits,
			"networking": a.networking, "publishedPorts": a.publishedPorts, "monitoring": a.monitoringPolicy,
			"runtime": a.runtime, "releases": a.releases, "volumes": a.applicationVolumes, "services": a.applicationServices, "metrics": a.metrics,
		}
		handler, ok := readers[in.Section]
		if !ok {
			return out, mcpInputError("Unknown application section")
		}
		owner, err := a.Store.MCPReadOwner(ctx, hash, app.ID)
		if err != nil {
			return out, err
		}
		response := mcpInvokeHandler(ctx, owner, http.MethodGet, app.ID, "", nil, handler)
		if err = mcpHandlerError(response.Code); err != nil {
			return out, err
		}
		if err = json.Unmarshal(response.Body.Bytes(), &out.Settings); err != nil {
			return out, err
		}
		if settings, ok := out.Settings.(map[string]any); ok && in.Section == "runtime" {
			delete(settings, "error")
		}
		if in.Section == "publishedPorts" || in.Section == "monitoring" || in.Section == "metrics" {
			current, err := a.Store.MCPReadOwner(ctx, hash, app.ID)
			if err != nil {
				return out, err
			}
			if !current.Admin {
				return out, pgx.ErrNoRows
			}
		}
	}
	return out, a.Store.MCPCheckApplication(ctx, hash, app.ID)
}

type mcpWriteResult struct {
	ApplicationID string `json:"applicationId,omitempty"`
	ResourceID    string `json:"resourceId,omitempty"`
	DeploymentID  string `json:"deploymentId,omitempty"`
	RunID         string `json:"runId,omitempty"`
	JobID         string `json:"jobId,omitempty"`
	Version       int    `json:"version,omitempty"`
	Status        string `json:"status"`
	DashboardURL  string `json:"dashboardUrl,omitempty"`
}

type mcpWriteOperation struct {
	access                               db.MCPWriteAccess
	method, id, runID, appID, resultKind string
	body                                 any
	handler                              http.HandlerFunc
}

type mcpCommandResponse struct {
	Body   bytes.Buffer
	Code   int
	header http.Header
}

func (r *mcpCommandResponse) Header() http.Header         { return r.header }
func (r *mcpCommandResponse) WriteHeader(status int)      { r.Code = status }
func (r *mcpCommandResponse) Write(p []byte) (int, error) { return r.Body.Write(p) }

func mcpInvokeHandler(ctx context.Context, owner model.User, method, id, runID string, body []byte, handler http.HandlerFunc) *mcpCommandResponse {
	params := chi.NewRouteContext()
	params.URLParams.Add("id", id)
	params.URLParams.Add("runId", runID)
	ctx = context.WithValue(context.WithValue(ctx, userKey, owner), chi.RouteCtxKey, params)
	request, _ := http.NewRequestWithContext(ctx, method, "/internal/application-command", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := &mcpCommandResponse{Code: http.StatusOK, header: make(http.Header)}
	handler(response, request)
	return response
}

func mcpHandlerError(status int) error {
	switch status {
	case 200, 201, 202, 204:
		return nil
	case 403, 404:
		return mcpInputError("Resource not found or operation is not permitted")
	case 409:
		return mcpInputError("Application changed or operation conflicts with active work. Reload application state.")
	case 503:
		return mcpInputError("Shipyard is in maintenance mode")
	case 400, 422:
		return mcpInputError("Input failed application validation or an operation prerequisite")
	default:
		return errors.New("application operation failed")
	}
}

func (a *API) mcpWriteApplication(ctx context.Context, hash string, op mcpWriteOperation) (mcpWriteResult, error) {
	var out mcpWriteResult
	op.access.Hash = hash
	owner, err := db.MCPWritePrincipal(ctx, a.Store.Pool, op.access)
	if err != nil {
		return out, err
	}
	// Reapply the actor's current admin status at command admission, including
	// commands whose configuration can contain administrator-only settings.
	op.access.RequireAdmin = owner.Admin
	ctx = db.WithMCPWrite(ctx, op.access)
	body, err := json.Marshal(op.body)
	if err != nil {
		return out, err
	}
	if op.access.CreateID != "" {
		existing, err := a.Store.Resource(ctx, op.access.CreateID)
		if err == nil && existing.Kind == "application" && existing.ParentID == op.access.TargetID {
			return a.mcpCreatedResult(ctx, existing), nil
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return out, err
		}
	}
	if op.access.DeploymentID != "" {
		d, err := a.Store.Deployment(ctx, op.access.DeploymentID)
		if err == nil && d.AppID == op.appID {
			return mcpWriteResult{ApplicationID: d.AppID, DeploymentID: d.ID, Status: d.State,
					DashboardURL: mcpDashboardURL(a.canonicalOrigin(ctx), d.AppID, "deployments", "deployment", d.ID)},
				db.CheckMCPWrite(ctx, a.Store.Pool)
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return out, err
		}
	}
	response := mcpInvokeHandler(ctx, owner, op.method, op.id, op.runID, body, op.handler)
	if ctx.Err() != nil {
		return out, ctx.Err()
	}
	if err := mcpHandlerError(response.Code); err != nil {
		// A concurrent retry may have created the same application.
		if op.access.CreateID != "" {
			if existing, lookupErr := a.Store.Resource(ctx, op.access.CreateID); lookupErr == nil &&
				existing.Kind == "application" && existing.ParentID == op.access.TargetID {
				return a.mcpCreatedResult(ctx, existing), db.CheckMCPWrite(ctx, a.Store.Pool)
			}
		}
		return out, err
	}
	var result struct {
		ID      string
		State   string
		JobID   string
		Version int
	}
	// The HTTP handlers may return configuration, source or runtime diagnostics.
	// Project only identifiers and state into a tool response.
	if response.Body.Len() > 0 && response.Body.Bytes()[0] == '{' {
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			return out, err
		}
	}
	out = mcpWriteResult{ApplicationID: op.appID, Version: result.Version, Status: "completed", JobID: result.JobID}
	if response.Code == 202 {
		out.Status = "queued"
	}
	tab, key, value := "", "", ""
	switch op.resultKind {
	case "application":
		out.ApplicationID = result.ID
	case "deployment":
		out.DeploymentID = result.ID
		tab, key, value = "deployments", "deployment", result.ID
	case "run":
		out.RunID = result.ID
		tab, key, value = "runs", "run", result.ID
	case "route":
		out.ResourceID = result.ID
	}
	if result.State != "" {
		out.Status = result.State
	}
	if op.access.Kind == "route" && out.ResourceID == "" {
		out.ResourceID = op.access.TargetID
	}
	if out.ApplicationID != "" {
		out.DashboardURL = mcpDashboardURL(a.canonicalOrigin(ctx), out.ApplicationID, tab, key, value)
	}
	credential, _ := ctx.Value(mcpTokenContextKey{}).(mcpCredential)
	_ = a.Store.Audit(ctx, owner.ID, "mcp.application_write", op.access.TargetID, "", map[string]string{
		"tokenId": credential.id, "permission": op.access.Permission,
		"applicationId": out.ApplicationID, "deploymentId": out.DeploymentID, "runId": out.RunID, "jobId": out.JobID,
	})
	return out, nil
}

func (a *API) mcpCreatedResult(ctx context.Context, app model.Resource) mcpWriteResult {
	return mcpWriteResult{ApplicationID: app.ID, Version: app.Version, Status: "completed",
		DashboardURL: mcpDashboardURL(a.canonicalOrigin(ctx), app.ID, "", "", "")}
}

func mcpApplicationOperation(id, permission, method string, body any, handler http.HandlerFunc) mcpWriteOperation {
	return mcpWriteOperation{access: db.MCPWriteAccess{TargetID: id, Kind: "application", Permission: permission},
		method: method, id: id, appID: id, body: body, handler: handler}
}

func mcpRequestUUID(ctx context.Context, action, target, requestID string) (string, error) {
	id, err := uuid.Parse(requestID)
	if err != nil {
		return "", mcpInputError("A valid requestId UUID is required")
	}
	credential, _ := ctx.Value(mcpTokenContextKey{}).(mcpCredential)
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte("shipyard:mcp:"+credential.id+":"+action+":"+target+":"+id.String())).String(), nil
}

type mcpCreateAppInput struct {
	EnvironmentID string             `json:"environmentId"`
	RequestID     string             `json:"requestId"`
	Name          string             `json:"name"`
	Data          map[string]any     `json:"data" jsonschema:"Dashboard application settings including workload, source, engine, serverId and Git settings when applicable"`
	Variables     map[string]*string `json:"variables,omitempty"`
	Secrets       map[string]string  `json:"secrets,omitempty" jsonschema:"Write-only values including compose for inline Compose"`
}

func (a *API) mcpCreateApp(ctx context.Context, hash string, in mcpCreateAppInput) (mcpWriteResult, error) {
	id, err := mcpRequestUUID(ctx, "create", in.EnvironmentID, in.RequestID)
	if err != nil {
		return mcpWriteResult{}, err
	}
	body, err := mcpAppResourceInput("application", in.Name, in.EnvironmentID, 0, in.Data, in.Variables, in.Secrets)
	if err != nil {
		return mcpWriteResult{}, err
	}
	op := mcpWriteOperation{access: db.MCPWriteAccess{TargetID: in.EnvironmentID, Kind: "environment",
		Permission: db.MCPConfigure, CreateID: id}, method: http.MethodPost, resultKind: "application", body: body, handler: a.saveResource}
	return a.mcpWriteApplication(ctx, hash, op)
}

func mcpAppResourceInput(kind, name, parent string, version int, data map[string]any, variables map[string]*string, secrets map[string]string) (model.ResourceInput, error) {
	raw, err := json.Marshal(data)
	return model.ResourceInput{Kind: kind, Name: name, ParentID: parent, Version: version, Data: raw,
		Variables: variables, Secrets: secrets}, err
}

type mcpAppSettingsInput struct {
	ApplicationID string         `json:"applicationId"`
	Section       string         `json:"section" jsonschema:"application, compose, limits, networking, publishedPorts, automation, jobSchedule, monitoring, logo, removeLogo, or ordering"`
	Version       int            `json:"version,omitempty"`
	Settings      map[string]any `json:"settings" jsonschema:"Dashboard input fields for the selected section. For application, supply name, a data patch, variables or write-only secrets."`
}

func (a *API) mcpAppSettings(ctx context.Context, hash string, in mcpAppSettingsInput) (mcpWriteResult, error) {
	settings := in.Settings
	if settings == nil {
		settings = map[string]any{}
	}
	if in.Version > 0 {
		settings["version"] = in.Version
	}
	var op mcpWriteOperation
	switch in.Section {
	case "application":
		resource, _, err := a.Store.MCPApplicationDetails(ctx, hash, in.ApplicationID)
		if err != nil {
			return mcpWriteResult{}, err
		}
		if in.Version <= 0 || resource.Version != in.Version {
			return mcpWriteResult{}, mcpInputError("Supply the current application version")
		}
		var data map[string]any
		if err := json.Unmarshal(resource.Data, &data); err != nil {
			return mcpWriteResult{}, err
		}
		if patch, exists := settings["data"]; exists {
			fields, ok := patch.(map[string]any)
			if !ok {
				return mcpWriteResult{}, mcpInputError("data must be an object")
			}
			for field, value := range fields {
				data[field] = value
			}
		}
		settings["data"] = data
		if _, exists := settings["name"]; !exists {
			settings["name"] = resource.Name
		}
		op = mcpApplicationOperation(in.ApplicationID, db.MCPConfigure, http.MethodPut, settings, a.saveResource)
	default:
		handlers := map[string]http.HandlerFunc{
			"compose": a.composeSource, "limits": a.resourceLimits, "networking": a.networking,
			"publishedPorts": a.publishedPorts, "automation": a.automation, "jobSchedule": a.jobSettings,
			"monitoring": a.monitoringPolicy, "logo": a.resourceLogo, "removeLogo": a.resourceLogo, "ordering": a.moveResource,
		}
		handler, ok := handlers[in.Section]
		if !ok {
			return mcpWriteResult{}, mcpInputError("Unknown application settings section")
		}
		method := http.MethodPut
		if in.Section == "removeLogo" {
			method = http.MethodDelete
		} else if in.Section == "ordering" {
			method = http.MethodPost
		}
		op = mcpApplicationOperation(in.ApplicationID, db.MCPConfigure, method, settings, handler)
	}
	return a.mcpWriteApplication(ctx, hash, op)
}

type mcpAppRouteInput struct {
	ApplicationID string         `json:"applicationId"`
	Action        string         `json:"action" jsonschema:"create, update, or sync"`
	RouteID       string         `json:"routeId,omitempty"`
	Name          string         `json:"name,omitempty"`
	Version       int            `json:"version,omitempty"`
	Data          map[string]any `json:"data,omitempty"`
	Mode          string         `json:"mode,omitempty" jsonschema:"DNS sync mode: adopt or replace"`
}

func (a *API) mcpAppRoute(ctx context.Context, hash string, in mcpAppRouteInput) (mcpWriteResult, error) {
	op := mcpApplicationOperation(in.ApplicationID, db.MCPConfigure, http.MethodPost, nil, a.saveResource)
	op.resultKind = "route"
	switch in.Action {
	case "create":
		op.id = ""
	case "update", "sync":
		if err := a.mcpRequireRoute(ctx, hash, in.ApplicationID, in.RouteID); err != nil {
			return mcpWriteResult{}, err
		}
		op.id, op.access.TargetID, op.access.Kind = in.RouteID, in.RouteID, "route"
		if in.Action == "sync" {
			op.handler, op.body = a.syncDomain, map[string]string{"mode": in.Mode}
			return a.mcpWriteApplication(ctx, hash, op)
		}
		if in.Version <= 0 {
			return mcpWriteResult{}, mcpInputError("Supply the current route version")
		}
		op.method = http.MethodPut
	default:
		return mcpWriteResult{}, mcpInputError("Unknown route action")
	}
	var err error
	op.body, err = mcpAppResourceInput("route", in.Name, in.ApplicationID, in.Version, in.Data, nil, nil)
	if err != nil {
		return mcpWriteResult{}, err
	}
	return a.mcpWriteApplication(ctx, hash, op)
}

func (a *API) mcpRequireRoute(ctx context.Context, hash, app, route string) error {
	if err := a.Store.MCPCheckApplication(ctx, hash, app); err != nil {
		return err
	}
	resource, err := a.Store.Resource(ctx, route)
	if err != nil {
		return err
	}
	if resource.Kind != "route" || resource.ParentID != app {
		return pgx.ErrNoRows
	}
	return nil
}

type mcpDeployAppInput struct {
	ApplicationID string `json:"applicationId"`
	RequestID     string `json:"requestId"`
}

type mcpFreshAppInput struct {
	ApplicationID string `json:"applicationId"`
	RequestID     string `json:"requestId"`
	Version       int    `json:"version"`
	ConfirmName   string `json:"confirmName"`
}

func (a *API) mcpDeployApp(ctx context.Context, hash string, in mcpDeployAppInput) (mcpWriteResult, error) {
	return a.mcpQueueDeployment(ctx, hash, in.ApplicationID, in.RequestID, db.MCPLifecycle, map[string]any{})
}

func (a *API) mcpFreshApp(ctx context.Context, hash string, in mcpFreshAppInput) (mcpWriteResult, error) {
	app, _, err := a.Store.MCPApplicationDetails(ctx, hash, in.ApplicationID)
	if err != nil {
		return mcpWriteResult{}, err
	}
	if in.Version != app.Version || in.ConfirmName != app.Name {
		return mcpWriteResult{}, mcpInputError("Fresh deploy requires the current application version and exact application name")
	}
	return a.mcpQueueDeployment(ctx, hash, in.ApplicationID, in.RequestID, db.MCPFreshDeploy,
		map[string]any{"fresh": true, "version": in.Version, "confirmName": in.ConfirmName})
}

func (a *API) mcpQueueDeployment(ctx context.Context, hash, app, requestID, permission string, body any) (mcpWriteResult, error) {
	op := mcpApplicationOperation(app, permission, http.MethodPost, body, a.deploy)
	id, err := mcpRequestUUID(ctx, permission, app, requestID)
	if err != nil {
		return mcpWriteResult{}, err
	}
	op.resultKind, op.access.DeploymentID = "deployment", id
	return a.mcpWriteApplication(ctx, hash, op)
}

type mcpControlAppInput struct {
	ApplicationID string `json:"applicationId"`
	Action        string `json:"action" jsonschema:"start, stop, restart, rollback, approvePreview, runJob, or cancelJob"`
	ReleaseID     string `json:"releaseId,omitempty"`
	RunID         string `json:"runId,omitempty"`
	SHA           string `json:"sha,omitempty"`
	RequestID     string `json:"requestId,omitempty" jsonschema:"Required for rollback and runJob; reuse this UUID when retrying"`
}

func (a *API) mcpControlApp(ctx context.Context, hash string, in mcpControlAppInput) (mcpWriteResult, error) {
	op := mcpApplicationOperation(in.ApplicationID, db.MCPLifecycle, http.MethodPost, nil, a.action)
	switch in.Action {
	case "start", "stop", "restart":
		op.body = map[string]string{"action": in.Action}
	case "rollback":
		id, err := mcpRequestUUID(ctx, "rollback", in.ApplicationID, in.RequestID)
		if err != nil {
			return mcpWriteResult{}, err
		}
		op.handler, op.body, op.resultKind, op.access.DeploymentID = a.rollback, map[string]string{"releaseId": in.ReleaseID}, "deployment", id
	case "approvePreview":
		op.handler, op.body = a.approvePreview, map[string]string{"sha": in.SHA}
	case "runJob":
		id, err := mcpRequestUUID(ctx, "runJob", in.ApplicationID, in.RequestID)
		if err != nil {
			return mcpWriteResult{}, err
		}
		op.handler, op.body, op.resultKind = a.jobRuns, map[string]string{"idempotencyKey": id}, "run"
	case "cancelJob":
		op.handler, op.runID, op.resultKind, op.access.AllowMaintenance = a.jobRun, in.RunID, "run", true
	default:
		return mcpWriteResult{}, mcpInputError("Unknown application action")
	}
	out, err := a.mcpWriteApplication(ctx, hash, op)
	if ctx.Err() != nil && (in.Action == "start" || in.Action == "restart") {
		return out, mcpInputError("Runtime action outcome is unknown. Inspect runtime state before retrying.")
	}
	if err == nil && in.Action == "stop" {
		_ = a.Store.Pool.QueryRow(ctx, `SELECT j.id FROM jobs j JOIN application_control c
			ON j.dedupe='application-stop:'||c.app_id||':'||c.generation
			WHERE c.app_id=$1 AND j.kind='application-stop'`, in.ApplicationID).Scan(&out.JobID)
	}
	return out, err
}

type mcpCleanupAppInput struct {
	ApplicationID string   `json:"applicationId"`
	Target        string   `json:"target" jsonschema:"application, route, deployment, or jobRuns"`
	ResourceID    string   `json:"resourceId,omitempty"`
	RunIDs        []string `json:"runIds,omitempty"`
	ConfirmName   string   `json:"confirmName,omitempty" jsonschema:"Exact application name for application deletion"`
}

func (a *API) mcpCleanupApp(ctx context.Context, hash string, in mcpCleanupAppInput) (mcpWriteResult, error) {
	op := mcpApplicationOperation(in.ApplicationID, db.MCPCleanup, http.MethodDelete, nil, a.deleteResource)
	switch in.Target {
	case "application":
		app, _, err := a.Store.MCPApplicationDetails(ctx, hash, in.ApplicationID)
		if err != nil {
			return mcpWriteResult{}, err
		}
		if in.ConfirmName != app.Name {
			return mcpWriteResult{}, mcpInputError("Application deletion requires the exact application name")
		}
		op.access.AllowDeleting = true
		op.access.ConfirmName = in.ConfirmName
	case "route":
		if err := a.mcpRequireRoute(ctx, hash, in.ApplicationID, in.ResourceID); err != nil {
			return mcpWriteResult{}, err
		}
		op.id, op.access.TargetID, op.access.Kind = in.ResourceID, in.ResourceID, "route"
	case "deployment":
		if err := a.Store.MCPCheckApplication(ctx, hash, in.ApplicationID); err != nil {
			return mcpWriteResult{}, err
		}
		deployment, err := a.Store.Deployment(ctx, in.ResourceID)
		if err != nil || deployment.AppID != in.ApplicationID {
			return mcpWriteResult{}, pgx.ErrNoRows
		}
		op.id, op.handler = in.ResourceID, a.deleteDeployment
	case "jobRuns":
		op.method, op.handler, op.body = http.MethodPost, a.deleteJobRuns, map[string][]string{"ids": in.RunIDs}
	default:
		return mcpWriteResult{}, mcpInputError("Unknown cleanup target")
	}
	return a.mcpWriteApplication(ctx, hash, op)
}
