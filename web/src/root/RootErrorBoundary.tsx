import { useEffect } from "react";
import { useRouteError } from "react-router";

import { AppErrorFallback } from "@/components/AppErrorBoundary";
import { reportError } from "@/lib/telemetry";
export function RootErrorBoundary() {
  const error = useRouteError();
  useEffect(() => {
    void reportError(error instanceof Error ? error : new Error(String(error)));
  }, [error]);
  return <AppErrorFallback />;
}
