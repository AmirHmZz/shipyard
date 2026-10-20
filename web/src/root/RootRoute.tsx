import { Outlet } from "react-router";

import { AppProviders } from "@/providers/AppProviders";
export function RootRoute() {
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  );
}
