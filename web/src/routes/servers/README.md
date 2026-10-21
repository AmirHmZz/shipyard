# Servers

URL: `/servers`.
`ServersMainView` and `ServerCard` render `useServersPage`/`useServerCard` state and named actions.
Endpoint hooks validate metrics, Docker checks and provisioning using `generics/schema.ts`.
Endpoints: `/resources`, `/servers/:id/metrics` and server action endpoints.
Provisioning waits for server results; pending controls come from mutation state.
`ServerCPUChart` remains a named lazy export; request contracts cover schema validation and API parity.
