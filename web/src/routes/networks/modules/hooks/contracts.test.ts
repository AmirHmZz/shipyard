// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiException } from "@/lib/api/errors";

import { setCSRF } from "@/lib/api/csrf";
import { reportError } from "@/lib/telemetry";
import { createTestClient, renderWithClient } from "@/test/renderWithClient";

import { useDockerNetworks } from "./useDockerNetworks";
import { useRemoveNetwork } from "./useRemoveNetwork";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));
type Contract = {
  name: string;
  run: (client: QueryClient) => Promise<ApiException | null>;
  request: [string, { method: string; body: string }?];
  response: unknown;
};
// Literal requests retained from the removed service contract table.
const cases: Contract[] = [
  {
    name: "inventory special id",
    run: async (client) => {
      const { result } = renderHook(
        () => useDockerNetworks("a/b?c", true),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
    request: ["/servers/a%2Fb%3Fc/networks"],
    response: [
      {
        Id: "docker-1",
        Name: "bridge",
        Driver: "bridge",
        EnableIPv6: false,
        Labels: null,
        IPAM: { Config: [] },
        Containers: null,
      },
    ],
  },
  {
    name: "remove network",
    run: async (client) => {
      const { result } = renderHook(
        () => useRemoveNetwork(),
        renderWithClient(client),
      );
      act(() => result.current.mutate("a/b?c"));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
    request: ["/resources/a%2Fb%3Fc", { method: "DELETE", body: "{}" }],
    response: { ok: true },
  },
];
let client: QueryClient;
beforeEach(() => {
  client = createTestClient();
  setCSRF("contract-csrf");
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  setCSRF("");
});
describe("networks surface request contracts", () => {
  it.each(cases)(
    "$name preserves the complete request",
    async ({ run, request, response }) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetch);
      expect(await run(client)).toBeNull();
      expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/v1" + request[0], {
        method: "GET",
        body: undefined,
        signal: request[1] ? undefined : expect.any(AbortSignal),
        ...request[1],
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": "contract-csrf",
        },
      });
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    },
  );
  it.each(cases)(
    "$name rejects incompatible responses",
    async ({ run, request }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response('{"invalid":true}', {
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );
      expect((await run(client))?.error).toMatchObject({
        kind: "schema",
        path: request[0],
      });
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledTimes(request[1] ? 1 : 0);
    },
  );
  it("does not fetch a disabled server inventory", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(
      () => useDockerNetworks("", false),
      renderWithClient(client),
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });
});
