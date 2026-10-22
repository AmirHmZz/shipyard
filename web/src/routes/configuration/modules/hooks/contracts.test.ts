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

import { useCreateGitWebhook } from "./useCreateGitWebhook";
import { useCreateNetwork } from "./useCreateNetwork";
import { useGiteaInstances } from "./useGiteaInstances";
import { useGitSetupConfig } from "./useGitSetupConfig";
import { useGitSetupStatus } from "./useGitSetupStatus";
import { useHAProxySettings } from "./useHAProxySettings";
import { useNetworkInventory } from "./useNetworkInventory";
import { useReconnectGit } from "./useReconnectGit";
import { useSaveGiteaInstance } from "./useSaveGiteaInstance";
import { useSaveHAProxySettings } from "./useSaveHAProxySettings";
import { useStartGitSetup } from "./useStartGitSetup";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));

import { dockerNetworkKeys } from "@/lib/query-keys";
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
const network = {
  name: "net",
  dockerId: "docker",
  subnet: "10.0.0.0/24",
  dynamicRange: "",
  enableIPv6: false,
  ipv6Subnet: "",
};
const instance = {
  id: "instance",
  name: "Gitea",
  url: "https://git.test",
  clientId: "client",
  clientSecret: "secret",
};
const savedInstance = {
  id: instance.id,
  name: instance.name,
  url: instance.url,
  clientId: instance.clientId,
  configured: true,
};
const dockerNetwork = {
  Id: "docker",
  Name: "bridge",
  Driver: "bridge",
  EnableIPv6: true,
  Labels: {},
  IPAM: { Config: [{ Subnet: "10.0.0.0/24" }] },
  Containers: { container: { Name: "web" } },
};
type Contract = {
  name: string;
  run: (client: QueryClient) => Promise<ApiException | null>;
  request: [string, { method: string; body: string }?];
  posted?: [string, unknown?];
  response: unknown;
  successMessage?: string;
};
// All sixteen original literal cases retained; two uncovered GET endpoints added.
const cases: Contract[] = [
  {
    name: "createGitWebhook id",
    request: ["/git/id/webhook-secret", { method: "POST", body: "{}" }],
    posted: ["/git/id/webhook-secret"],
    response: { secret: "signing-secret" },
    run: async (client) => {
      const { result } = renderHook(
        () => useCreateGitWebhook("id"),
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
    name: "reconnectGit id",
    request: ["/git/id/reconnect", { method: "POST", body: "{}" }],
    posted: ["/git/id/reconnect"],
    response: { connectionId: "git", url: "https://git.test/authorize" },
    run: async (client) => {
      const { result } = renderHook(
        () => useReconnectGit("id"),
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
    name: "git setup id",
    request: ["/git/id/setup"],
    response: {
      state: "ready",
      account: "owner",
      webhookUrl: "https://shipyard.test/webhook",
      signingSecretConfigured: true,
      lastDelivery: null,
    },
    run: async (client) => {
      const { result } = renderHook(
        () => useGitSetupStatus({ ...resource, id: "id" }),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "HAProxy settings id",
    request: ["/servers/id/haproxy"],
    response: {
      version: 3,
      bindings: {},
      lastJobId: "",
      appliedAt: null,
      image: "haproxy:3",
      frontends: [],
      apply: null,
    },
    run: async (client) => {
      const { result } = renderHook(
        () => useHAProxySettings({ ...resource, id: "id" }),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "network inventory id",
    request: ["/servers/id/networks"],
    response: [dockerNetwork],
    run: async (client) => {
      const { result } = renderHook(
        () => useNetworkInventory("id", true),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "create network id",
    request: [
      "/servers/id/networks",
      { method: "POST", body: JSON.stringify(network) },
    ],
    response: resource,
    run: async (client) => {
      const { result } = renderHook(
        () => useCreateNetwork("id"),
        renderWithClient(client),
      );
      act(() => result.current.mutate(network));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "save HAProxy id",
    request: [
      "/servers/id/haproxy",
      {
        method: "PUT",
        body: '{"version":3,"bindings":{"http":["0.0.0.0:80"]}}',
      },
    ],
    response: { jobId: "job" },
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveHAProxySettings("id"),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          version: 3,
          bindings: { http: ["0.0.0.0:80"] },
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "createGitWebhook a/b?c",
    request: ["/git/a%2Fb%3Fc/webhook-secret", { method: "POST", body: "{}" }],
    posted: ["/git/a%2Fb%3Fc/webhook-secret"],
    response: { secret: "signing-secret" },
    run: async (client) => {
      const { result } = renderHook(
        () => useCreateGitWebhook("a/b?c"),
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
    name: "reconnectGit a/b?c",
    request: ["/git/a%2Fb%3Fc/reconnect", { method: "POST", body: "{}" }],
    posted: ["/git/a%2Fb%3Fc/reconnect"],
    response: { connectionId: "git", url: "https://git.test/authorize" },
    run: async (client) => {
      const { result } = renderHook(
        () => useReconnectGit("a/b?c"),
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
    name: "git setup a/b?c",
    request: ["/git/a%2Fb%3Fc/setup"],
    response: {
      state: "ready",
      account: "owner",
      webhookUrl: "https://shipyard.test/webhook",
      signingSecretConfigured: true,
      lastDelivery: null,
    },
    run: async (client) => {
      const { result } = renderHook(
        () => useGitSetupStatus({ ...resource, id: "a/b?c" }),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "HAProxy settings a/b?c",
    request: ["/servers/a%2Fb%3Fc/haproxy"],
    response: {
      version: 3,
      bindings: {},
      lastJobId: "",
      appliedAt: null,
      image: "haproxy:3",
      frontends: [],
      apply: null,
    },
    run: async (client) => {
      const { result } = renderHook(
        () => useHAProxySettings({ ...resource, id: "a/b?c" }),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "network inventory a/b?c",
    request: ["/servers/a%2Fb%3Fc/networks"],
    response: [dockerNetwork],
    run: async (client) => {
      const { result } = renderHook(
        () => useNetworkInventory("a/b?c", true),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "create network a/b?c",
    request: [
      "/servers/a%2Fb%3Fc/networks",
      { method: "POST", body: JSON.stringify(network) },
    ],
    response: resource,
    run: async (client) => {
      const { result } = renderHook(
        () => useCreateNetwork("a/b?c"),
        renderWithClient(client),
      );
      act(() => result.current.mutate(network));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "save HAProxy a/b?c",
    request: [
      "/servers/a%2Fb%3Fc/haproxy",
      {
        method: "PUT",
        body: '{"version":3,"bindings":{"http":["0.0.0.0:80"]}}',
      },
    ],
    response: { jobId: "job" },
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveHAProxySettings("a/b?c"),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          version: 3,
          bindings: { http: ["0.0.0.0:80"] },
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "save Gitea instance",
    request: [
      "/git/gitea/instances",
      { method: "PUT", body: JSON.stringify(instance) },
    ],
    response: savedInstance,
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveGiteaInstance(),
        renderWithClient(client),
      );
      act(() => result.current.mutate(instance));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "start Git setup",
    request: [
      "/git/setup/start",
      {
        method: "POST",
        body: JSON.stringify({
          provider: "github",
          name: "Git",
          owner: "org",
          instanceId: "",
        }),
      },
    ],
    posted: [
      "/git/setup/start",
      { provider: "github", name: "Git", owner: "org", instanceId: "" },
    ],
    response: { connectionId: "git", url: "https://git.test/authorize" },
    run: async (client) => {
      const { result } = renderHook(
        () => useStartGitSetup(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          provider: "github",
          name: "Git",
          owner: "org",
          instanceId: "",
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "Gitea instances",
    request: ["/git/gitea/instances"],
    response: [savedInstance],
    run: async (client) => {
      const { result } = renderHook(
        () => useGiteaInstances("gitea"),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "Git setup configuration",
    request: ["/git/setup/config"],
    response: {
      origin: "https://shipyard.test",
      giteaCallback: "https://shipyard.test/api/v1/git/setup/gitea/callback",
    },
    run: async (client) => {
      const { result } = renderHook(
        () => useGitSetupConfig(),
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

describe("configuration surface request contracts", () => {
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

it("preserves network fields for the other route sharing this query key", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify([dockerNetwork]), {
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  const { result } = renderHook(
    () => useNetworkInventory("server", true),
    renderWithClient(client),
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(client.getQueryData(dockerNetworkKeys.filter("server"))).toEqual([
    dockerNetwork,
  ]);
});
