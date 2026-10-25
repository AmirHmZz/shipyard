# Networks

URL: `/networks`.
`NetworksMainView` renders inventory through `useNetworksPage`; configuration opens `/configure/network/*`.
`useDockerNetworks` and `useRemoveNetwork` own endpoints and pass schemas from `generics/schema.ts`.
Endpoints: `/resources`, `/servers/:id/networks` and network resource removal.
`useControlPlaneNetworks` and `useSaveControlPlaneNetwork` manage administrator-only local control-plane attachments and observed state; Docker changes wait for the server response.
Removal uses cache optimism and rollback; inventory reconciliation and subnet calculations live in `utils`.
Hook contracts cover request parity, schema failures and concurrent invalidation.
