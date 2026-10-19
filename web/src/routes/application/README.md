# Application

URLs: /applications/:id.

Application overview, deployments, domains, volumes, previews, runtime logs, and terminal.

Endpoints: `/applications/:id/*`, `/deployments/:id`, `/routes/:id/status` (plus shared resource queries).
Key modules: `ApplicationMainView`, `ApplicationOverview`, `ApplicationNetworking`, `ApplicationDeployments`, `ComposeSource`, route hooks/services.
