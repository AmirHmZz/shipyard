import { useEffect } from "react";
import { useRouteError } from "react-router";
import { reportError } from "@/lib/telemetry";
import { AppErrorFallback } from "./app-error-boundary";

export function ContentErrorBoundary() {
  const error = useRouteError();
  useEffect(() => {
    void reportError(error instanceof Error ? error : new Error(String(error)));
  }, [error]);
  return <AppErrorFallback compact />;
}
