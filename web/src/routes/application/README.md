# Application

URLs: /applications/:id.

Application overview, deployments, domains, previews, and terminal.

Endpoints: `/applications/:id/*`, `/deployments/:id`, `/routes/:id/status` (plus shared resource queries).
Key modules: `ApplicationMainView`, `ApplicationOverview`, `ApplicationNetworking`, `ApplicationDeployments`, `ComposeSource`, route hooks/services.
