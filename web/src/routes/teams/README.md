# Teams

URL: `/teams`.
`TeamsMainView` composes member, project access and invitation views; `useTeamsPage` owns UI transitions.
Endpoint hooks in `modules/hooks` pass `generics/schema.ts` schemas to the internal API adapters.
Endpoints: `/resources`, `/teams/:id/members`, invitation creation and project assignments.
Removal uses cache optimism with rollback; assignments wait for acknowledgement, and invitations show pending mutation variables.
Query keys and the tested reducer live in `generics`; request and optimistic contracts live beside hooks.
