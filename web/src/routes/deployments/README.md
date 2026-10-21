# Deployments

URL: `/deployments`.
`DeploymentsMainView` composes the page header and `DeploymentHistoryContent`.
Shared `useDeployments` and `useResources` hooks own requests and pass schemas from `lib/schemas`.
Endpoints: `/deployments`, `/resources`; there is no duplicate route API layer.
`DeploymentHistoryContent` handles loading/error/empty branches and renders the shared `DeploymentTable`.
Preserve shared query keys and route code splitting when extending the view.
