import {
  AppErrorBoundary,
  AppErrorFallback,
} from "@/components/app-error-boundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";
import { useEffect, type ReactNode } from "react";
import { reportError } from "@/lib/telemetry";
import "./index.css";

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000, refetchOnWindowFocus: false },
  },
});

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#111813" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return <div className="p-10">Loading dashboard…</div>;
}

export function ErrorBoundary() {
  const error = useRouteError();
  useEffect(() => {
    void reportError(error instanceof Error ? error : new Error(String(error)));
  }, [error]);
  return <AppErrorFallback />;
}

export default function Root() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={client}>
        <Outlet />
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export const meta = () => [{ title: "Shipyard — Deployment control" }];
