# Integrations

URL: `/integrations`.
`IntegrationsMainView` composes provider sections and shared grants; `useIntegrationsPage` owns actions.
Shared `lib/hooks` endpoint hooks validate `/resources` and grants using `lib/schemas`.
Provider configuration navigates to `/configure/*`; this feature needs no duplicate response schemas.
Mapped provider actions use data attributes and a named container handler.
Provider setup and grant writes wait for successful server responses.
Registry connections use automatic team-scoped authentication; their local deletion hook removes credentials after confirmation.
Admins manage shared SOCKS proxies, Telegram/Bale connections and explicit test deliveries.
