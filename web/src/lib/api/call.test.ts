import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/mini";

import { emptyResponseSchema } from "@/lib/schemas/responses";

import { callApi, callApiBlob } from "./call";
import { setCSRF } from "./csrf";

const schema = z.object({ id: z.string() });
afterEach(() => {
  vi.unstubAllGlobals();
  setCSRF("");
});
function respond(body: BodyInit | null, options?: ResponseInit) {
  const fetch = vi.fn().mockResolvedValue(new Response(body, options));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
describe("validated Result transport", () => {
  it("parses a valid response and strips uncontracted fields", async () => {
    respond('{"id":"one","extra":true}');
    expect(await callApi({ path: "/items", schema })).toEqual({
      ok: true,
      data: { id: "one" },
    });
  });
  it("reports the endpoint and issue path for a wrong response shape", async () => {
    respond('{"id":7}');
    const result = await callApi({ path: "/items", schema });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "schema", path: "/items" },
    });
    if (result.ok || result.error.kind !== "schema")
      throw new Error("Expected schema failure");
    expect(result.error.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["id"] })]),
    );
  });
  it("returns a parse error for a successful HTML proxy response", async () => {
    respond("<html>gateway</html>");
    expect(await callApi({ path: "/items", schema })).toEqual({
      ok: false,
      error: { kind: "parse", path: "/items" },
    });
  });
  it("keeps actionable server messages from error envelopes", async () => {
    respond('{"error":"Record conflict","debug":"ignored"}', { status: 409 });
    expect(await callApi({ path: "/items", schema })).toEqual({
      ok: false,
      error: {
        kind: "http",
        status: 409,
        message: "Record conflict",
        path: "/items",
      },
    });
  });
  it.each(["", "<html>gateway</html>", '{"other":"value"}', '{"error":17}'])(
    "falls back to status text for invalid error envelopes: %s",
    async (body) => {
      respond(body, { status: 502, statusText: "Bad Gateway" });
      expect(await callApi({ path: "/items", schema })).toMatchObject({
        ok: false,
        error: { kind: "http", message: "Bad Gateway" },
      });
    },
  );
  it("captures rejected fetches as network errors", async () => {
    const cause = new TypeError("offline");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
    expect(await callApi({ path: "/items", schema })).toEqual({
      ok: false,
      error: { kind: "network", path: "/items", cause },
    });
  });
  it("separates cancellations from network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")),
    );
    expect(await callApi({ path: "/items", schema })).toEqual({
      ok: false,
      error: { kind: "aborted", path: "/items" },
    });
  });
  it("forwards cancellation, method, JSON, CSRF and same-origin credentials", async () => {
    const fetch = respond('{"id":"one"}');
    const controller = new AbortController();
    setCSRF("current-token");
    await callApi({
      path: "/items/a%2Fb%3Fc",
      method: "PUT",
      body: { name: "exact" },
      signal: controller.signal,
      schema,
    });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/v1/items/a%2Fb%3Fc", {
      method: "PUT",
      body: '{"name":"exact"}',
      signal: controller.signal,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "current-token",
      },
    });
  });
  it.each([200, 204])(
    "accepts an empty %i body without inventing an envelope",
    async (status) => {
      respond(null, { status });
      expect(
        await callApi({ path: "/items", schema: emptyResponseSchema }),
      ).toEqual({ ok: true, data: undefined });
    },
  );
  it("accepts legacy JSON acknowledgements", async () => {
    respond("{}");
    expect(
      await callApi({ path: "/items", schema: emptyResponseSchema }),
    ).toEqual({ ok: true, data: {} });
  });
  it("still validates empty responses against the schema chosen by the caller", async () => {
    respond(null, { status: 204 });
    expect(await callApi({ path: "/items", schema })).toMatchObject({
      ok: false,
      error: { kind: "schema", path: "/items" },
    });
  });
  it("downloads binary archives through the separate caller", async () => {
    respond("archive", {
      headers: { "Content-Type": "application/octet-stream" },
    });
    const result = await callApiBlob("/backup", {
      method: "POST",
      body: { passphrase: "test-passphrase" },
    });
    if (!result.ok) throw new Error("Expected archive");
    expect(result.data).toBeInstanceOf(Blob);
    expect(await result.data.text()).toBe("archive");
  });
  it("validates a surface-provided binary schema in the core caller", async () => {
    respond("archive", {
      headers: { "Content-Type": "application/octet-stream" },
    });
    expect(await callApiBlob("/backup", { schema: z.string() })).toMatchObject({
      ok: false,
      error: { kind: "schema", path: "/backup" },
    });
  });
  it("does not download a successful JSON response as an archive", async () => {
    respond("{}", { headers: { "Content-Type": "application/json" } });
    expect(await callApiBlob("/backup")).toEqual({
      ok: false,
      error: { kind: "parse", path: "/backup" },
    });
  });
});
