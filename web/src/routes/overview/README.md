# Overview

URL: `/`.
`OverviewMainView` composes metrics, getting-started steps and deployment history via `useOverviewPage`.
Shared `useResources` and `useDeployments` endpoint hooks pass response schemas from `lib/schemas`.
Endpoints: `/resources`, `/deployments`; creation uses the shared resource editor/configuration surface.
Keep route-local presentation components here and shared table/field primitives in `src/components`.
Loading/error branches remain declarative; navigation and editor state belong to the page hook.
