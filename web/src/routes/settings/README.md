# Settings

URL: `/settings`.
`SettingsMainView` composes security, system updates, access, users, backups, alerts and history.
Specific form/page hooks own related state; endpoint hooks pass schemas from `generics/schema.ts`.
Endpoints: `/settings/*`, `/users` and history category endpoints; session comes from `lib/session`.
Maintenance uses cache optimism with rollback; security, updates, backups and user writes wait for success.
Mutation metadata owns API toasts; Blob downloads use the internal mutation adapter.
Reducer, request, maintenance and browser contracts cover validation, permissions and recovery behavior.
