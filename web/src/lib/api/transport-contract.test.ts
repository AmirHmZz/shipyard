import { afterEach, describe, expect, it, vi } from "vitest";

import { queuedResponseSchema } from "@/lib/schemas/acknowledgements";
import { emptyResponseSchema } from "@/lib/schemas/responses";

import { callApi, callApiBlob } from "./call";
import { setCSRF } from "./csrf";

afterEach(() => {
  vi.unstubAllGlobals();
  setCSRF("");
});
describe("API transport boundary", () => {
  it("attaches same-origin sessions and the current CSRF token to mutations", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('{"queued":true}', {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    setCSRF("session-token");
    expect(
      await callApi({
        path: "/applications/app/deploy",
        method: "POST",
        body: { ref: "main" },
        schema: queuedResponseSchema,
      }),
    ).toEqual({ ok: true, data: { queued: true } });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/applications/app/deploy",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: '{"ref":"main"}',
        headers: expect.objectContaining({ "X-CSRF-Token": "session-token" }),
      }),
    );
  });
  it("preserves actionable API errors and handles non-JSON proxy failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response('{"error":"DNS record conflict"}', { status: 409 }),
        )
        .mockResolvedValueOnce(
          new Response("gateway error", {
            status: 502,
            statusText: "Bad Gateway",
          }),
        ),
    );
    await expect(
      callApi({ path: "/routes/id/status", schema: emptyResponseSchema }),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "http",
        path: "/routes/id/status",
        status: 409,
        message: "DNS record conflict",
      },
    });
    await expect(
      callApi({ path: "/resources", schema: emptyResponseSchema }),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "http",
        path: "/resources",
        status: 502,
        message: "Bad Gateway",
      },
    });
  });
  it("downloads encrypted archives as binary blobs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("encrypted-archive", {
          headers: { "Content-Type": "application/octet-stream" },
        }),
      ),
    );
    const result = await callApiBlob("/backup", {
      method: "POST",
      body: { passphrase: "local-test-only" },
    });
    if (!result.ok) throw new Error("Expected a validated binary archive");
    expect(await result.data.text()).toBe("encrypted-archive");
  });
});
