# Web route folders

Routes are registered explicitly in `src/routes.ts`. Folder names have no routing meaning. Each route has `route.tsx` and a README (at most 15 lines); the dashboard uses `layout.tsx` with `<Outlet />`.

Use only the needed subfolders under `modules/`: `components/` (PascalCase `.tsx` files and an `index.ts` barrel), `generics/` (`index.ts`, `types.ts`, `schema.ts` for Zod forms/runtime validation, `constants.ts`), `services/` (`index.ts` and plain async API functions using `api()`, no React), `utils/` (`index.ts`), and `hooks/` (`index.ts` for TanStack Query and UI hooks). Do not create empty folders or barrels.

1. Keep `route.tsx` thin: it reads params or outlet context and renders `<XMainView />`, with no business logic. Allowed exports are `default`, `clientLoader`, `clientAction`, `meta`, `handle`, `links`, `shouldRevalidate`, `ErrorBoundary`, and `HydrateFallback`. SPA mode has no server `loader` or `action`.
2. Only `src/routes.ts` references `route.tsx` and `layout.tsx`. Never import or barrel-re-export route modules; preserve route code splitting and HMR.
3. Dependency direction is components → hooks → services → generics/utils. Services never import React, hooks, or components. Generics and utils import nothing else from the route.
4. Import siblings in one folder directly (`./Foo`), never through their own barrel. Across folders in one route, use the destination barrel (`../hooks`). Outside the route, use `@/`. Never import another route's `modules/`.
5. Use generated API types from `@/lib/schema` via `@/lib/api`; do not redeclare them. Put route-local aliases and types in `generics/types.ts` and derive Zod types with `z.infer`.
6. Put code used by two or more routes in `src/components` (keep shadcn in `ui/`) or `src/lib`.
7. Group sibling routes that share code under one feature folder, with shared `modules/` at the feature root and one subfolder per route containing only `route.tsx`.
8. Use generated route types (`import type { Route } from "./+types/route"`) only when the module needs params or loader data.
9. Do not add `"use client"`. Use `import type` and `export type` with `verbatimModuleSyntax`.
10. Use PascalCase component filenames inside route folders. Leave existing kebab-case files in `src/components` as they are.
11. Components never call `api()`, `post()` or `fetch` directly (including through the `@/lib/api` facade). Services own the endpoint, method and body serialization, take domain arguments (never a `path`), and return typed results.
12. Hooks own `useQuery` / `useMutation`; components only call hooks.
13. Services and hooks used by two or more routes live in `src/lib/services` and `src/lib/hooks`.
14. Build API paths with `apiPath` when interpolating identifiers.
15. Query keys come from factories (shared: `src/lib/query-keys.ts`; route-local: `generics/constants.ts`). No `queryKey: [` literals elsewhere. Factories are pure and tested.
16. Mutations are hooks; `mutateAsync` runs inside the component's try/catch, toasts stay in the component, invalidation lives in `onSuccess` and returns its promise.
17. Services import only `@/lib/api/client` and `@/lib/api/types` (never the `@/lib/api` facade, React, or hooks).
18. Session comes from `useCurrentSession()`/`useAccount()`/`useAdmin()` (dashboard outlet context). Never peek at the query cache.
19. Every page route module exports `meta` (static title) and `ErrorBoundary` (re-export of `ContentErrorBoundary`); `handle.pageLabel` is for the header label of routes not in the sidebar.
20. `bun run lint` must pass; the import-boundary rules in `../.oxlintrc.json` enforce rules 3-4, 11, 17.
21. Files in route folders stay under ~300 lines where there is a natural seam; large shared components live in folders with an `index.ts`.

CI runs `bun run lint` (web) and `bun run format:check` (root).

Tooling: Oxlint checks src, e2e, configs and scripts. Oxfmt formats web/src and scripts with sorted imports. Husky runs lint-staged and conventional commit validation. Use `bun run lint:fix` (web) and `bun run format` (root) before committing.
