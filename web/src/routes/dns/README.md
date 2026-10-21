# DNS

URLs: `/dns`, `/dns/:id`, `/dns/:id/records/:record`.
Leaf folders hold route entries only; shared views, hooks and schemas live under this feature's `modules`.
`useDNSPage`, `useDNSRecordsPage` and `useDNSRecordForm` own navigation, selection and form logic.
Endpoint hooks validate `/zones/:id/records` and `/zones/:id/certificates` with `generics/schema.ts`.
Record removal uses cache optimism/rollback; creation shows mutation variables while pending.
Hook contracts and optimistic tests preserve payloads, permissions, error handling and refetch behavior.
