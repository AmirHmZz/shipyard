import type { ErrorInfo, ReactNode } from "react";

import { Component } from "react";

import { reportError } from "@/lib/telemetry";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportError(error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <AppErrorFallback />;
  }
}

export function AppErrorFallback({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "flex items-center justify-center p-6"
          : "flex min-h-screen items-center justify-center p-6"
      }
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Reload the dashboard to try again.
          </p>
          <Button onClick={() => window.location.reload()}>
            Reload dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
