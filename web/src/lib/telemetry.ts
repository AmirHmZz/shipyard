import * as Sentry from "@sentry/react";
import type { ErrorEvent } from "@sentry/react";

export function scrubEvent(event: ErrorEvent): ErrorEvent {
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
export async function initTelemetry(): Promise<void> {
  try {
    const response = await fetch("/api/v1/telemetry", {
      credentials: "omit",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return;
    const config = await response.json();
    if (typeof config.dsn !== "string" || !config.dsn) return;
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
  } catch {
    // A failed monitoring configuration request must not block the dashboard.
  }
}
