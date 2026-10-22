# Configuration

URL: `/configure/:kind/:id`.
`useConfigurationPage` chooses resource, variables, grants, network, Git and HAProxy views.
Endpoint hooks pass `generics/schema.ts` schemas for `/git/*`, network inventory and `/servers/:id/haproxy`.
Shared resource/variable/grant hooks use `lib/schemas`; setup, provisioning and writes wait for server results.
Form hooks own validation/named actions; tested reducers own related transitions and stable draft-row IDs.
`ConfigurationGuard` tracks dirty scopes and blocks navigation; do not reset drafts on ordinary refetches.
Request contracts and browser tests cover provider redirects, payloads, row identity and unsaved edits.
