// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiException } from "@/lib/api/errors";
import type { Resource } from "@/lib/api/types";

import { setCSRF } from "@/lib/api/csrf";
import { reportError } from "@/lib/telemetry";
import { createTestClient, renderWithClient } from "@/test/renderWithClient";

import { useCheckDockerVersion } from "./useCheckDockerVersion";
import { useProvisionServer } from "./useProvisionServer";
import { useServerMetrics } from "./useServerMetrics";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));

const resource: Resource = {
  id: "a/b?c",
  kind: "application",
  name: "App",
  data: { source: "git" },
  version: 3,
  teamId: "team",
  parentId: "",
  secretKeys: [],
  variables: {},
  canWrite: true,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};
type Contract = {
  name: string;
  run: (client: QueryClient) => Promise<ApiException | null>;
  request: [string, { method: string; body: string }?];
  posted?: [string, unknown?];
  response: unknown;
  successMessage?: string;
};
// All original literal request cases retained, including default POST bodies.
const cases: Contract[] = [
  {
    name: "metrics",
    request: ["/servers/a%2Fb%3Fc/metrics"],
    response: [
      {
        resourceId: "server",
        cpu: 0,
        memory: 0,
        disk: 0,
        online: false,
        at: "2026-10-19T00:00:00Z",
        containers: [],
      },
    ],
    run: async (client) => {
      const { result } = renderHook(
        () => useServerMetrics(resource),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "Docker version",
    request: ["/servers/a%2Fb%3Fc/test", { method: "POST", body: "{}" }],
    posted: ["/servers/a%2Fb%3Fc/test"],
    response: { dockerVersion: "29.8.1" },
    run: async (client) => {
      const { result } = renderHook(
        () => useCheckDockerVersion("a/b?c"),
        renderWithClient(client),
      );
      act(() => result.current.mutate(undefined));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "provision",
    request: ["/servers/a%2Fb%3Fc/provision", { method: "POST", body: "{}" }],
    posted: ["/servers/a%2Fb%3Fc/provision"],
    response: { queued: true },
    successMessage: "Provisioning queued. Track it in Settings → Jobs.",
    run: async (client) => {
      const { result } = renderHook(
        () => useProvisionServer(),
        renderWithClient(client),
      );
      act(() => result.current.mutate("a/b?c"));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
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

describe("servers surface request contracts", () => {
  it.each(cases)(
    "$name preserves the complete request",
    async ({ run, request, posted, response, successMessage }) => {
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
      if (posted)
        expect(fetch).toHaveBeenCalledWith(
          "/api/v1" + posted[0],
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify(posted[1] ?? {}),
          }),
        );
      expect(toast.error).not.toHaveBeenCalled();
      if (successMessage)
        expect(toast.success).toHaveBeenCalledExactlyOnceWith(successMessage, {
          id: "api-success:" + successMessage,
        });
      else expect(toast.success).not.toHaveBeenCalled();
    },
  );
  it.each(cases)(
    "$name rejects incompatible responses at the core boundary",
    async ({ run, request }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response('{"invalid":true}', {
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );
      const error = await run(client);
      expect(error?.error).toMatchObject({ kind: "schema", path: request[0] });
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledTimes(request[1] ? 1 : 0);
    },
  );
});
