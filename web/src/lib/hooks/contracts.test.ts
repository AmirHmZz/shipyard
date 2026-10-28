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

import { useBranches } from "./useBranches";
import { useDeleteResource } from "./useDeleteResource";
import { useDeployments } from "./useDeployments";
import { useGrants } from "./useGrants";
import { useProbeServerFingerprint } from "./useProbeServerFingerprint";
import { useProviderZones } from "./useProviderZones";
import { useRepositories } from "./useRepositories";
import { useResources } from "./useResources";
import { useSaveResource } from "./useSaveResource";
import { useSaveVariable } from "./useSaveVariable";
import { useServiceOptions } from "./useServiceOptions";
import { useSetGrant } from "./useSetGrant";
import { useTestDNSCredentials } from "./useTestDNSCredentials";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));

import { resourceKeys } from "@/lib/query-keys";
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
const signal = new AbortController().signal;
const payload = {
  kind: "project" as const,
  name: "Project",
  data: {},
  parentId: "",
  teamId: "team",
  secrets: {},
  version: 3,
};
type Contract = {
  name: string;
  run: (client: QueryClient) => Promise<ApiException | null>;
  request: [string, { method?: string; body?: string; signal?: AbortSignal }?];
  posted?: [string, unknown?];
  response: unknown;
  query: boolean;
  successMessage?: string;
};
const deployment = {
  id: "deployment",
  applicationId: "application",
  state: "healthy",
  phase: "done",
  commit: "abc",
  error: "",
  releaseId: "release",
  rollbackId: "",
  createdAt: "2026-10-19",
  updatedAt: "2026-10-19",
};
// Twenty-two original literal requests retained; GET abort signals now belong to the internal adapter. Resource GET and cancellation/select coverage added.
const cases: Contract[] = [
  {
    name: "provider zones",
    request: ["/dns/a%2Fb%3Fc/zones"],
    response: [{ id: "zone", name: "example.com" }],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useProviderZones("a/b?c", true),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "service options",
    request: ["/applications/a%2Fb%3Fc/services"],
    response: [{ name: "web", ignoredPorts: false }],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useServiceOptions("a/b?c", true),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "repositories and abort signal",
    request: ["/git/a%2Fb%3Fc/repositories", { signal }],
    response: [{ full_name: "owner/repo" }],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useRepositories("a/b?c", true),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "branches and encoded repository",
    request: [
      "/git/a%2Fb%3Fc/branches?repository=owner%2Frepo%3Fref%3Dmain",
      { signal },
    ],
    response: [{ name: "main" }],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useBranches("a/b?c", "owner/repo?ref=main", true),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "grants",
    request: ["/resources/a%2Fb%3Fc/grants"],
    response: ["team"],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useGrants({ ...resource, id: "a/b?c" }),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "grant access",
    request: [
      "/resources/a%2Fb%3Fc/grants",
      {
        method: "POST",
        body: JSON.stringify({ teamId: "team", granted: true }),
      },
    ],
    posted: ["/resources/a%2Fb%3Fc/grants", { teamId: "team", granted: true }],
    response: { ok: true },
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSetGrant("a/b?c"),
        renderWithClient(client),
      );
      act(() => result.current.mutate({ teamId: "team", granted: true }));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "revoke access",
    request: [
      "/resources/a%2Fb%3Fc/grants",
      {
        method: "POST",
        body: JSON.stringify({ teamId: "team", granted: false }),
      },
    ],
    posted: ["/resources/a%2Fb%3Fc/grants", { teamId: "team", granted: false }],
    response: { ok: true },
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSetGrant("a/b?c"),
        renderWithClient(client),
      );
      act(() => result.current.mutate({ teamId: "team", granted: false }));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "test DNS",
    request: [
      "/dns/test",
      {
        method: "POST",
        body: JSON.stringify({ provider: "cloudflare", token: "secret" }),
      },
    ],
    posted: ["/dns/test", { provider: "cloudflare", token: "secret" }],
    response: { ok: true },
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useTestDNSCredentials(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          provider: "cloudflare",
          token: "secret",
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "fingerprint default port",
    request: [
      "/servers/fingerprint",
      {
        method: "POST",
        body: JSON.stringify({ host: "server.test", port: 22 }),
      },
    ],
    posted: ["/servers/fingerprint", { host: "server.test", port: 22 }],
    response: { fingerprint: "SHA256:abc" },
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useProbeServerFingerprint(),
        renderWithClient(client),
      );
      act(() => result.current.mutate({ host: "server.test", port: 0 }));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "fingerprint explicit port",
    request: [
      "/servers/fingerprint",
      {
        method: "POST",
        body: JSON.stringify({ host: "server.test", port: 2222 }),
      },
    ],
    posted: ["/servers/fingerprint", { host: "server.test", port: 2222 }],
    response: { fingerprint: "SHA256:abc" },
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useProbeServerFingerprint(),
        renderWithClient(client),
      );
      act(() => result.current.mutate({ host: "server.test", port: 2222 }));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "new resource",
    request: ["/resources", { method: "POST", body: JSON.stringify(payload) }],
    response: resource,
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveResource(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          existingId: undefined,
          kind: "project",
          payload: payload,
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "update resource",
    request: [
      "/resources/a%2Fb%3Fc",
      { method: "PUT", body: JSON.stringify(payload) },
    ],
    response: resource,
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveResource(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          existingId: "a/b?c",
          kind: "project",
          payload: payload,
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "route omits name",
    request: [
      "/resources/a%2Fb%3Fc",
      {
        method: "PUT",
        body: '{"kind":"project","data":{},"parentId":"","teamId":"team","secrets":{},"version":3}',
      },
    ],
    response: resource,
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveResource(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          existingId: "a/b?c",
          kind: "route",
          payload: payload,
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "delete resource",
    request: ["/resources/a%2Fb%3Fc", { method: "DELETE", body: "{}" }],
    response: { ok: true },
    query: false,
    successMessage: "Deletion queued. Cleanup will continue in the background.",
    run: async (client) => {
      const { result } = renderHook(
        () => useDeleteResource(),
        renderWithClient(client),
      );
      act(() => result.current.mutate("a/b?c"));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "ordinary variable",
    request: [
      "/resources/a%2Fb%3Fc",
      {
        method: "PUT",
        body: '{"kind":"application","name":"App","data":{"source":"git"},"version":3,"variables":{"env:NAME":"value"}}',
      },
    ],
    response: resource,
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveVariable(resource),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          name: "env:NAME",
          value: "value",
          encrypted: false,
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "remove ordinary variable",
    request: [
      "/resources/a%2Fb%3Fc",
      {
        method: "PUT",
        body: '{"kind":"application","name":"App","data":{"source":"git"},"version":3,"variables":{"env:NAME":null}}',
      },
    ],
    response: resource,
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveVariable(resource),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          name: "env:NAME",
          value: null,
          encrypted: false,
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "secret variable",
    request: [
      "/resources/a%2Fb%3Fc",
      {
        method: "PUT",
        body: '{"kind":"application","name":"App","data":{"source":"git"},"version":3,"secrets":{"build:TOKEN":"secret"}}',
      },
    ],
    response: resource,
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveVariable(resource),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          name: "build:TOKEN",
          value: "secret",
          encrypted: true,
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "remove secret variable",
    request: [
      "/resources/a%2Fb%3Fc",
      {
        method: "PUT",
        body: '{"kind":"application","name":"App","data":{"source":"git"},"version":3,"secrets":{"build:TOKEN":""}}',
      },
    ],
    response: resource,
    query: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveVariable(resource),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          name: "build:TOKEN",
          value: null,
          encrypted: true,
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "all deployments",
    request: ["/deployments"],
    response: [deployment],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useDeployments(),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "filtered deployments",
    request: ["/deployments?applicationId=app"],
    response: [deployment],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useDeployments("app"),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "encoded deployment filter",
    request: ["/deployments?applicationId=a%2Fb%3Fc"],
    response: [deployment],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useDeployments("a/b?c"),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "empty deployment filter",
    request: ["/deployments"],
    response: [deployment],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useDeployments(""),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "resource list",
    request: ["/resources"],
    response: [resource],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useResources(),
        renderWithClient(client),
      );
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

describe("shared surface request contracts", () => {
  it.each(cases)(
    "$name preserves the complete request",
    async ({ run, request, posted, response, successMessage, query }) => {
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
        ...request[1],
        signal: query ? expect.any(AbortSignal) : undefined,
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
    async ({ run, request, query }) => {
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
      expect(toast.error).toHaveBeenCalledTimes(query ? 0 : 1);
    },
  );
});

it("owns and aborts the repository query signal when its reader unmounts", async () => {
  const abort = vi.fn();
  const fetch = vi.fn(
    (_path: string, options: { signal: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          abort();
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const { unmount } = renderHook(
    () => useRepositories("git", true),
    renderWithClient(client),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
  unmount();
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(abort).toHaveBeenCalledTimes(1);
  expect(toast.error).not.toHaveBeenCalled();
});
it("keeps select projections out of the validated shared resource cache", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify([resource]))),
  );
  const { result } = renderHook(
    () => useResources((rows) => rows.length),
    renderWithClient(client),
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toBe(1);
  expect(client.getQueryData(resourceKeys.all)).toEqual([resource]);
});

it("updates the renamed resource before a delayed refetch completes", async () => {
  const client = createTestClient();
  client.setQueryData(resourceKeys.all, [{ ...resource, name: "Backend" }]);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ...resource, name: "Backend 2", version: 4 }),
        ),
      ),
  );
  const { result } = renderHook(
    () => useSaveResource(),
    renderWithClient(client),
  );
  act(() =>
    result.current.mutate({
      existingId: resource.id,
      kind: "application",
      payload: { ...payload, kind: "application", name: "Backend 2" },
    }),
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(client.getQueryData(resourceKeys.all)).toEqual([
    { ...resource, name: "Backend 2", version: 4 },
  ]);
  client.clear();
});
