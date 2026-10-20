// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiException } from "@/lib/api/errors";

import { setCSRF } from "@/lib/api/csrf";
import { reportError } from "@/lib/telemetry";
import { createTestClient, renderWithClient } from "@/test/renderWithClient";

import { useConfirmServerDeletion } from "./useConfirmServerDeletion";
import { useRepairServerConnection } from "./useRepairServerConnection";
import { useRetryServerDeletion } from "./useRetryServerDeletion";
import { useReviewServerDeletion } from "./useReviewServerDeletion";
import { useServerDeletionStatus } from "./useServerDeletionStatus";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));

const connection = {
  host: "server.test",
  port: 22,
  user: "root",
  fingerprint: "SHA256:example",
  authMethod: "password",
  secrets: { password: "secret" },
};
const plan = {
  id: "plan",
  serverId: "a/b?c",
  serverName: "Server",
  daemonId: "daemon",
  expiresAt: "2026-10-19T00:00:00Z",
  remove: [],
  preserve: [],
  blockers: [],
};
type Contract = {
  name: string;
  run: (client: QueryClient) => Promise<ApiException | null>;
  request: [string, { method: string; body: string }?];
  posted?: [string, unknown?];
  response: unknown;
  successMessage?: string;
};
// All five literal request cases retained, including exact confirmation body.
const cases: Contract[] = [
  {
    name: "status",
    request: ["/servers/a%2Fb%3Fc/deletion"],
    response: { plan, stage: "queued", error: "", jobId: "job", done: false },
    run: async (client) => {
      const { result } = renderHook(
        () => useServerDeletionStatus("a/b?c", true),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "repair connection",
    request: [
      "/servers/a%2Fb%3Fc/deletion/connection",
      { method: "PUT", body: JSON.stringify(connection) },
    ],
    response: { ok: true },
    run: async (client) => {
      const { result } = renderHook(
        () => useRepairServerConnection("a/b?c"),
        renderWithClient(client),
      );
      act(() => result.current.mutate(connection));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "confirm deletion",
    request: [
      "/servers/a%2Fb%3Fc",
      {
        method: "DELETE",
        body: '{"planId":"plan","name":"Server","deleteVolumes":true}',
      },
    ],
    response: { ok: true, jobId: "job" },
    run: async (client) => {
      const { result } = renderHook(
        () => useConfirmServerDeletion("a/b?c"),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          planId: "plan",
          name: "Server",
          deleteVolumes: true,
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "retry deletion",
    request: [
      "/servers/a%2Fb%3Fc/deletion/retry",
      { method: "POST", body: "{}" },
    ],
    posted: ["/servers/a%2Fb%3Fc/deletion/retry"],
    response: { jobId: "job" },
    run: async (client) => {
      const { result } = renderHook(
        () => useRetryServerDeletion("a/b?c"),
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
    name: "review deletion",
    request: [
      "/servers/a%2Fb%3Fc/deletion-plan",
      { method: "POST", body: "{}" },
    ],
    posted: ["/servers/a%2Fb%3Fc/deletion-plan"],
    response: plan,
    run: async (client) => {
      const { result } = renderHook(
        () => useReviewServerDeletion(),
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

describe("server-deletion surface request contracts", () => {
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
