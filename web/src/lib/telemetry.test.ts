import type { ErrorEvent } from "@sentry/react";

import { init, captureException } from "@sentry/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initTelemetry, scrubEvent, reportError } from "./telemetry";

vi.mock("@sentry/react", () => ({ init: vi.fn(), captureException: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Sentry boundary", () => {
  it("reports route errors without component info and preserves class boundary stacks", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"dsn":"https://public@sentry.test/1"}'),
        ),
    );
    await initTelemetry();
    const error = new Error("page failed");
    await reportError(error);
    expect(captureException).toHaveBeenLastCalledWith(error, {
      contexts: { react: { componentStack: undefined } },
    });
    await reportError(error, { componentStack: "at Example" });
    expect(captureException).toHaveBeenLastCalledWith(error, {
      contexts: { react: { componentStack: "at Example" } },
    });
  });

  it("excludes credentials and preserves error diagnostics", () => {
    const event = scrubEvent({
      type: undefined,
      exception: { values: [{ type: "Error", value: "synthetic failure" }] },
      user: { email: "private@example.test" },
      extra: { password: "private" },
      breadcrumbs: [{ message: "private console output" }],
      request: {
        url: "https://user:password@shipyard.test/terminal?csrf=private#token",
        headers: { Cookie: "session=private" },
        data: "private-body",
        cookies: { session: "private" },
      },
    } as ErrorEvent);
    expect(event.request).toEqual({ url: "https://shipyard.test/terminal" });
    expect(event.user).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.exception?.values?.[0].value).toBe("synthetic failure");
  });
  it("uses runtime settings and does not enable replay or tracing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            dsn: "https://public@sentry.test/1",
            environment: "test",
            release: "v1",
          }),
        ),
      ),
    );
    await initTelemetry();
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@sentry.test/1",
        environment: "test",
        release: "v1",
        dataCollection: expect.objectContaining({
          userInfo: false,
          httpBodies: [],
        }),
        beforeSend: scrubEvent,
      }),
    );
  });
  it("stays disabled for empty configuration and tolerates unavailable monitoring", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{"dsn":""}'))
        .mockRejectedValueOnce(new Error("offline")),
    );
    await initTelemetry();
    await expect(initTelemetry()).resolves.toBeUndefined();
    expect(init).not.toHaveBeenCalled();
  });
});
