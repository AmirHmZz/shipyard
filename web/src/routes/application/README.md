# Application

URL: `/applications/:id`.
`ApplicationMainView` renders `useApplicationPage`; focused hooks own compose, networking, preview and action UI.
Endpoint hooks pass `generics/schema.ts` schemas for `/applications/:id/*`, `/deployments/:id` and route status/actions.
Deployment-history removal uses cache optimism; deploys, rollback, source saves and runtime actions wait for success.
Keep draft-row identities stable and state transitions in tested reducers; pending controls use TanStack state.
Compose editor and terminal remain lazy; fixed-shape SSE/WebSocket JSON messages validate at their transport boundary.
Hook contracts and browser tests cover payload parity, schema errors, permissions, dirty navigation and editor CSP.
