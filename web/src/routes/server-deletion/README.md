# Server deletion

URL: `/servers/:id/delete`.
`ServerDeletionMainView` renders review, inventory, progress and repair views through `useServerDeletionPage`.
Hooks own `/servers/:id/deletion-plan`, `/servers/:id/deletion`, retry, connection repair and DELETE confirmation.
Responses/forms use `generics/schema.ts`; related transitions use tested reducers in `generics`.
All cleanup mutations wait for server results; preserve exact-name confirmation and data acknowledgement.
Hook contracts and browser tests cover changed inventories, retry, permissions and safe confirmation.
