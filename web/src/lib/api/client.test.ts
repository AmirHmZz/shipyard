import { afterEach, describe, expect, it, vi } from "vitest";
import { api, post, setCSRF } from "./client";

afterEach(() => vi.unstubAllGlobals());
describe("API transport boundary", () => {
  it("attaches same-origin sessions and the current CSRF token to mutations", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('{"queued":true}', {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    setCSRF("session-token");
    expect(await post("/applications/app/deploy", { ref: "main" })).toEqual({
      queued: true,
    });
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
    await expect(api("/routes/id/status")).rejects.toThrow(
      "DNS record conflict",
    );
    await expect(api("/resources")).rejects.toThrow("Bad Gateway");
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
    const result = await post<Blob>("/backup", {
      passphrase: "local-test-only",
    });
    expect(await result.text()).toBe("encrypted-archive");
  });
});
