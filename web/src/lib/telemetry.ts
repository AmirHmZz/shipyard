import type { ErrorEvent as SentryErrorEvent } from "@sentry/react";
import type * as SentryReact from "@sentry/react";
import type { ErrorInfo } from "react";

export function scrubEvent(event: SentryErrorEvent): SentryErrorEvent {
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  if (event.request) {
    const request = event.request;
    if (request.url) {
      try {
        const url = new URL(request.url);
        url.search = "";
        url.hash = "";
        url.username = "";
        url.password = "";
        request.url = url.href;
      } catch {
        delete request.url;
      }
    }
    delete request.headers;
    delete request.cookies;
    delete request.data;
    delete request.query_string;
  }
  return event;
}

// Load public configuration from the control plane; credentials are never sent.
// Monitoring must not prevent the dashboard from opening when it is unavailable.
type TelemetryClient = typeof SentryReact;
let ready: Promise<TelemetryClient | undefined> = Promise.resolve(undefined);

export function initTelemetry(): Promise<void> {
  const earlyErrors: unknown[] = [];
  function remember(error: unknown) {
    if (earlyErrors.length < 20) earlyErrors.push(error);
  }
  function onError(event: ErrorEvent) {
    return remember(event.error || new Error(event.message));
  }
  function onRejection(event: PromiseRejectionEvent) {
    return remember(event.reason);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
  }
  ready = configureTelemetry();
  return ready.then((client) => {
    if (typeof window !== "undefined") {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    }
    if (client) for (const error of earlyErrors) client.captureException(error);
  });
}

async function configureTelemetry(): Promise<TelemetryClient | undefined> {
  try {
    const response = await fetch("/api/v1/telemetry", {
      credentials: "omit",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return;
    const config = await response.json();
    if (typeof config.dsn !== "string" || !config.dsn) return;
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release || undefined,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
      },
      beforeSend: scrubEvent,
      // Avoid console/network/UI breadcrumbs and automatic session collection.
      integrations: (defaults) =>
        defaults.filter((integration) =>
          [
            "InboundFilters",
            "FunctionToString",
            "BrowserApiErrors",
            "GlobalHandlers",
            "LinkedErrors",
            "Dedupe",
          ].includes(integration.name),
        ),
      initialScope: { tags: { component: "frontend" } },
    });
    return Sentry;
  } catch {
    // A failed monitoring configuration request must not block the dashboard.
  }
}

export async function reportError(error: Error, info?: ErrorInfo) {
  try {
    const Sentry = await ready;
    Sentry?.captureException(error, {
      contexts: { react: { componentStack: info?.componentStack } },
    });
  } catch {
    /* Reporting must never replace the fallback UI. */
  }
}
