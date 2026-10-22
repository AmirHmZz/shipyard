import "./index.css";
export { RootLayout as Layout } from "./root/RootLayout";
export { RootErrorBoundary as ErrorBoundary } from "./root/RootErrorBoundary";
export { RootHydrateFallback as HydrateFallback } from "./root/RootHydrateFallback";
export { RootRoute as default } from "./root/RootRoute";
export function meta() {
  return [{ title: "Shipyard — Deployment control" }];
}
