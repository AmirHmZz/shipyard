// @vitest-environment jsdom
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

import { useApplicationMetrics } from "./useApplicationMetrics";
import { useApplicationNetworking } from "./useApplicationNetworking";
import { useApplicationReleases } from "./useApplicationReleases";
import { useApplicationRuntime } from "./useApplicationRuntime";
import { useApplicationServices } from "./useApplicationServices";
import { useApplicationVolumes } from "./useApplicationVolumes";
import { useApprovePreview } from "./useApprovePreview";
import { useComposeSource } from "./useComposeSource";
import { useCreateDeployment } from "./useCreateDeployment";
import { useDeleteActionResource } from "./useDeleteActionResource";
import { useDeployComposeSource } from "./useDeployComposeSource";
import { useDomainStatus } from "./useDomainStatus";
import { useRemoveDeployment } from "./useRemoveDeployment";
import { useRollbackApplication } from "./useRollbackApplication";
import { useRunApplicationAction } from "./useRunApplicationAction";
import { useSaveApplicationNetworking } from "./useSaveApplicationNetworking";
import { useSaveApplicationPreview } from "./useSaveApplicationPreview";
import { useSaveComposeSource } from "./useSaveComposeSource";
import { useSelectedDeployment } from "./useSelectedDeployment";
import { useSyncRoute } from "./useSyncRoute";

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
  request: [string, { method: string; body?: string }?];
  posted?: [string, unknown?];
  response: unknown;
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

describe.each([
  ["id", "id"],
  ["a/b?c", "a%2Fb%3Fc"],
])("application surface request contracts (%s)", (id, encoded) => {
  // All twenty-two original literal requests retained for both identifier encodings; volume GET added.
  const cases: Contract[] = [
    {
      name: `getApplicationRuntime ${id}`,
      request: [`/applications/${encoded}/runtime`],
      response: { status: "running", containers: ["web"] },
      run: async (client) => {
        const { result } = renderHook(
          () => useApplicationRuntime(id),
          renderWithClient(client),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `getApplicationMetrics ${id}`,
      request: [`/applications/${encoded}/metrics`],
      response: [
        {
          resourceId: id,
          cpu: 1,
          memory: 2,
          disk: 3,
          online: true,
          at: "2026-10-19",
          containers: [],
        },
      ],
      run: async (client) => {
        const { result } = renderHook(
          () => useApplicationMetrics(id, true),
          renderWithClient(client),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `getApplicationReleases ${id}`,
      request: [`/applications/${encoded}/releases`],
      response: [
        {
          id: "release",
          commit: "abc",
          createdAt: "2026-10-19",
          images: { web: "image:v1" },
        },
      ],
      run: async (client) => {
        const { result } = renderHook(
          () => useApplicationReleases(id, true),
          renderWithClient(client),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `getApplicationNetworking ${id}`,
      request: [`/applications/${encoded}/networking`],
      response: {
        version: 3,
        services: { web: { hostname: "app", connections: [] } },
        pending: false,
      },
      run: async (client) => {
        const { result } = renderHook(
          () => useApplicationNetworking({ ...resource, id: id }),
          renderWithClient(client),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `getApplicationServices ${id}`,
      request: [`/applications/${encoded}/services`],
      response: [{ name: "web", replicas: 1, ignoredPorts: false }],
      run: async (client) => {
        const { result } = renderHook(
          () => useApplicationServices({ ...resource, id: id }),
          renderWithClient(client),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `getComposeSource ${id}`,
      request: [`/applications/${encoded}/compose`],
      response: { yaml: "services: {}", version: 3 },
      run: async (client) => {
        const { result } = renderHook(
          () => useComposeSource({ ...resource, id: id }),
          renderWithClient(client),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `selected deployment ${id}`,
      request: [`/deployments/${encoded}`],
      response: deployment,
      run: async (client) => {
        const { result } = renderHook(
          () => useSelectedDeployment(id, true),
          renderWithClient(client),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `domain status ${id}`,
      request: [`/routes/${encoded}/status`],
      response: {
        routeId: id,
        domain: "app.example.com",
        dns: "ready",
        propagation: "ready",
        certificate: "ready",
        routing: "ready",
        error: "",
        expiresAt: null,
        records: [],
      },
      run: async (client) => {
        const { result } = renderHook(
          () => useDomainStatus({ ...resource, id: id }),
          renderWithClient(client),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `delete resource ${id}`,
      request: [`/resources/${encoded}`, { method: "DELETE", body: "{}" }],
      response: { ok: true },
      run: async (client) => {
        const { result } = renderHook(
          () => useDeleteActionResource(),
          renderWithClient(client),
        );
        act(() => result.current.mutate("delete:" + id));
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `remove deployment ${id}`,
      request: [`/deployments/${encoded}`, { method: "DELETE" }],
      response: { jobId: "job" },
      successMessage: "Deployment cleanup queued",
      run: async (client) => {
        const { result } = renderHook(
          () => useRemoveDeployment("application"),
          renderWithClient(client),
        );
        act(() => result.current.mutate(id));
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `createDeployment {} ${id}`,
      request: [
        `/applications/${encoded}/deploy`,
        { method: "POST", body: JSON.stringify({}) },
      ],
      posted: [`/applications/${encoded}/deploy`, {}],
      response: { id: "deployment" },
      run: async (client) => {
        const { result } = renderHook(
          () => useCreateDeployment(id),
          renderWithClient(client),
        );
        act(() => result.current.mutate({}));
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: 'createDeployment { fresh: true, confirmName: "App", version: 3 } id',
      request: [
        `/applications/${encoded}/deploy`,
        {
          method: "POST",
          body: JSON.stringify({ fresh: true, confirmName: "App", version: 3 }),
        },
      ],
      posted: [
        `/applications/${encoded}/deploy`,
        { fresh: true, confirmName: "App", version: 3 },
      ],
      response: { id: "deployment" },
      run: async (client) => {
        const { result } = renderHook(
          () => useCreateDeployment(id),
          renderWithClient(client),
        );
        act(() =>
          result.current.mutate({
            fresh: true,
            confirmName: "App",
            version: 3,
          }),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `deployComposeSource { version: 3 } ${id}`,
      request: [
        `/applications/${encoded}/deploy`,
        { method: "POST", body: JSON.stringify({ version: 3 }) },
      ],
      posted: [`/applications/${encoded}/deploy`, { version: 3 }],
      response: { id: "deployment" },
      run: async (client) => {
        const { result } = renderHook(
          () => useDeployComposeSource(id),
          renderWithClient(client),
        );
        act(() => result.current.mutate({ version: 3 }));
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: 'rollbackApplication { releaseId: "release" } id',
      request: [
        `/applications/${encoded}/rollback`,
        { method: "POST", body: JSON.stringify({ releaseId: "release" }) },
      ],
      posted: [`/applications/${encoded}/rollback`, { releaseId: "release" }],
      response: { id: "deployment" },
      run: async (client) => {
        const { result } = renderHook(
          () => useRollbackApplication(id),
          renderWithClient(client),
        );
        act(() => result.current.mutate({ releaseId: "release" }));
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: 'runApplicationAction { action: "restart" } id',
      request: [
        `/applications/${encoded}/action`,
        { method: "POST", body: JSON.stringify({ action: "restart" }) },
      ],
      posted: [`/applications/${encoded}/action`, { action: "restart" }],
      response: { ok: true },
      run: async (client) => {
        const { result } = renderHook(
          () => useRunApplicationAction(id),
          renderWithClient(client),
        );
        act(() => result.current.mutate("restart"));
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: 'updateApplicationVersion { sha: "a".repeat(40) } id',
      request: [
        `/applications/${encoded}/approve-preview`,
        { method: "POST", body: JSON.stringify({ sha: "a".repeat(40) }) },
      ],
      posted: [
        `/applications/${encoded}/approve-preview`,
        { sha: "a".repeat(40) },
      ],
      response: { queued: true },
      successMessage: "Preview approved and queued",
      run: async (client) => {
        const { result } = renderHook(
          () =>
            useApprovePreview({
              refreshAll: true,
              successMessage: "Preview approved and queued",
            }),
          renderWithClient(client),
        );
        act(() =>
          result.current.mutate({ id: id, ...{ sha: "a".repeat(40) } }),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: 'createApplicationPreview { sha: "b".repeat(40) } id',
      request: [
        `/applications/${encoded}/approve-preview`,
        { method: "POST", body: JSON.stringify({ sha: "b".repeat(40) }) },
      ],
      posted: [
        `/applications/${encoded}/approve-preview`,
        { sha: "b".repeat(40) },
      ],
      response: { queued: true },
      run: async (client) => {
        const { result } = renderHook(
          () => useApprovePreview(),
          renderWithClient(client),
        );
        act(() =>
          result.current.mutate({ id: id, ...{ sha: "b".repeat(40) } }),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `save published-ports ${id}`,
      request: [
        `/applications/${encoded}/published-ports`,
        { method: "PUT", body: '{"version":3,"services":{}}' },
      ],
      response: resource,
      run: async (client) => {
        const { result } = renderHook(
          () => useSaveApplicationNetworking(id),
          renderWithClient(client),
        );
        act(() =>
          result.current.mutate({
            published: true,
            payload: {
              version: 3,
              services: {},
            },
          }),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `save networking ${id}`,
      request: [
        `/applications/${encoded}/networking`,
        { method: "PUT", body: '{"version":3,"services":{}}' },
      ],
      response: resource,
      run: async (client) => {
        const { result } = renderHook(
          () => useSaveApplicationNetworking(id),
          renderWithClient(client),
        );
        act(() =>
          result.current.mutate({
            published: false,
            payload: {
              version: 3,
              services: {},
            },
          }),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `save preview ${id}`,
      request: [
        `/resources/${encoded}`,
        {
          method: "PUT",
          body: '{"kind":"application","name":"App","version":3,"data":{"previews":true}}',
        },
      ],
      response: resource,
      run: async (client) => {
        const { result } = renderHook(
          () => useSaveApplicationPreview(),
          renderWithClient(client),
        );
        act(() =>
          result.current.mutate({
            id: id,
            payload: {
              kind: "application",
              name: "App",
              version: 3,
              data: { previews: true },
            },
          }),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `save Compose ${id}`,
      request: [
        `/applications/${encoded}/compose`,
        { method: "PUT", body: '{"yaml":"services: {}","version":3}' },
      ],
      response: { yaml: "services: {}", version: 3 },
      run: async (client) => {
        const { result } = renderHook(
          () => useSaveComposeSource(id),
          renderWithClient(client),
        );
        act(() => result.current.mutate({ yaml: "services: {}", version: 3 }));
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: `sync route ${id}`,
      request: [
        `/routes/${encoded}/sync`,
        { method: "POST", body: JSON.stringify({ mode: "sync" }) },
      ],
      posted: [`/routes/${encoded}/sync`, { mode: "sync" }],
      response: { queued: true },
      successMessage: "Domain reconciliation queued",
      run: async (client) => {
        const { result } = renderHook(
          () => useSyncRoute(id),
          renderWithClient(client),
        );
        act(() => result.current.mutate({ mode: "sync" }));
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
    {
      name: "volume inventory",
      request: [`/applications/${encoded}/volumes`],
      response: { volumes: [], errors: [] },
      run: async (client) => {
        const { result } = renderHook(
          () => useApplicationVolumes(id, true),
          renderWithClient(client),
        );
        await waitFor(() =>
          expect(result.current.isSuccess || result.current.isError).toBe(true),
        );
        return result.current.error;
      },
    },
  ];

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
