import {
  AppErrorBoundary,
  AppErrorFallback,
} from "@/components/app-error-boundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { ReactNode } from "react";
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
        <title>Shipyard — Deployment control</title>
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
