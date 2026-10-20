import type { ErrorInfo, ReactNode } from "react";

import { Component } from "react";

import { reportError } from "@/lib/telemetry";

import { AppErrorFallback } from "./AppErrorFallback";

export type AppErrorBoundaryProps = { children: ReactNode };

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
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
