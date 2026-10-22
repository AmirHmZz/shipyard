# Dashboard layout

URLs: all dashboard pages, including setup, sign-in and invitation acceptance.
`DashboardMainView` selects Auth or Shell; `useAuthForm`, `useShellPage` and `useWorkspaceSearch` own UI logic.
Endpoint hooks pass `generics/schema.ts`/shared session schemas for `/auth/me`, `/auth/status` and auth actions.
Authentication waits for server results; the mutation adapter captures CSRF/session state.
Session context is exposed through `lib/session`; global providers and Toaster live under `src/providers`.
Preserve Outlet context, shell navigation and route splitting; telemetry remains outside the toaster.
Contracts and real-backend browser workflows cover installation, invitations, sign-in and viewer boundaries.
