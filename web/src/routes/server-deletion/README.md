# Server deletion

URLs: /servers/:id/delete.

Reviews and runs the server deletion plan and progress UI.

Endpoints: `/servers/:id/deletion` and its confirmation/repair actions.
Key modules: `ServerDeletionMainView`, `Inventory`, `ServerDeletionPlanReview`, `ServerDeletionProgress`, route hooks/services.
