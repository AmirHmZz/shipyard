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

import { useAssignTeamMember } from "./useAssignTeamMember";
import { useCreateInvitation } from "./useCreateInvitation";
import { useRemoveTeamMember } from "./useRemoveTeamMember";
import { useTeamMembers } from "./useTeamMembers";

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
  posted?: [string, unknown];
  response: unknown;
  successMessage?: string;
};

// Literal paths, methods, bodies and posted payloads retained from the original
// teams services contract table; the assertions now exercise the fetch boundary.
const cases: Contract[] = [
  {
    name: "members",
    run: async (client) => {
      const { result } = renderHook(
        () => useTeamMembers(resource),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
    request: ["/teams/a%2Fb%3Fc/members"],
    response: [
      { id: "user", email: "u@example.test", name: "User", role: "member" },
    ],
  },
  {
    name: "remove member",
    run: async (client) => {
      const { result } = renderHook(
        () => useRemoveTeamMember("a/b?c"),
        renderWithClient(client),
      );
      act(() => result.current.mutate("a/b?c"));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
    request: [
      "/teams/a%2Fb%3Fc/members/a%2Fb%3Fc",
      { method: "DELETE", body: "{}" },
    ],
    response: { ok: true },
    successMessage: "Member removed",
  },
  {
    name: "assign member",
    run: async (client) => {
      const { result } = renderHook(
        () => useAssignTeamMember(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          projectId: "a/b?c",
          assignment: { userId: "user", role: "operator" },
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
    request: [
      "/projects/a%2Fb%3Fc/members",
      {
        method: "POST",
        body: JSON.stringify({ userId: "user", role: "operator" }),
      },
    ],
    posted: [
      "/projects/a%2Fb%3Fc/members",
      { userId: "user", role: "operator" },
    ],
    response: { ok: true },
    successMessage: "Project access updated",
  },
  {
    name: "invitation",
    run: async (client) => {
      const { result } = renderHook(
        () => useCreateInvitation("a/b?c"),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          email: "u@example.test",
          role: "member",
          projectId: "",
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
    request: [
      "/teams/a%2Fb%3Fc/invitations",
      {
        method: "POST",
        body: JSON.stringify({
          email: "u@example.test",
          role: "member",
          projectId: "",
        }),
      },
    ],
    posted: [
      "/teams/a%2Fb%3Fc/invitations",
      { email: "u@example.test", role: "member", projectId: "" },
    ],
    response: { url: "https://shipyard.test/invite?token=example" },
    successMessage: "Invitation created",
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

describe("teams surface request contracts", () => {
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
            body: JSON.stringify(posted[1]),
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
