// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiException } from "@/lib/api/errors";

import { getCSRF, setCSRF } from "@/lib/api/csrf";
import { reportError } from "@/lib/telemetry";
import { createTestClient, renderWithClient } from "@/test/renderWithClient";

import { useAlertPolicy } from "./useAlertPolicy";
import { useApplyUpdate } from "./useApplyUpdate";
import { useChangePassword } from "./useChangePassword";
import { useCheckForUpdates } from "./useCheckForUpdates";
import { useDashboardAccess } from "./useDashboardAccess";
import { useDisableTOTP } from "./useDisableTOTP";
import { useDownloadBackup } from "./useDownloadBackup";
import { useDownloadUpdateBackup } from "./useDownloadUpdateBackup";
import { useEnableTOTP } from "./useEnableTOTP";
import { useHistory } from "./useHistory";
import { usePlanUpdate } from "./usePlanUpdate";
import { useSaveAlertPolicy } from "./useSaveAlertPolicy";
import { useSaveDashboardAccess } from "./useSaveDashboardAccess";
import { useSetMaintenanceMode } from "./useSetMaintenanceMode";
import { useStartTOTP } from "./useStartTOTP";
import { useSystemUpdates } from "./useSystemUpdates";
import { useUpdateUser } from "./useUpdateUser";
import { useUsers } from "./useUsers";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));

import { sessionKeys } from "@/lib/query-keys";
const policy = {
  cpu: 90,
  memory: 80,
  disk: 75,
  sustainedSeconds: 60,
  offlineSeconds: 120,
};
const release = {
  version: "v1",
  previous: "v0",
  coreImage: "core:v1",
  executorImage: "executor:v1",
  schema: 1,
  migrations: [],
};
const plan = {
  id: "plan",
  revision: 1,
  current: release,
  target: release,
  migrations: { current: 1, target: 1, steps: [] },
  destructive: false,
  expires: "2026-10-20",
};
const operation = {
  id: "op",
  state: "waiting",
  error: "",
  plan,
  createdAt: "2026-10-19",
  updatedAt: "2026-10-19",
};
const status = {
  enabled: true,
  version: {
    version: "v1",
    commit: "abc",
    builtAt: "2026-10-19",
    architecture: "amd64",
    updaterProtocol: 1,
  },
  installation: { revision: 1, release },
  releases: [release],
  operation,
};
const session = {
  user: {
    id: "user",
    name: "User",
    email: "u@example.test",
    admin: true,
    totp: false,
  },
  csrf: "rotated-csrf",
};
const dashboard = {
  version: 3,
  enabled: true,
  origin: "https://shipyard.test",
  candidateOrigin: "",
  domain: "dash.test",
  routeId: "route",
  activeDomain: "dash.test",
  activeRouteId: "route",
  acmeConfigured: true,
  acmeEmail: "u@example.test",
};
type Contract = {
  name: string;
  run: (client: QueryClient) => Promise<ApiException | null>;
  request: [string, { method: string; body: string }?];
  posted?: [string, unknown?];
  response: unknown;
  query: boolean;
  binary?: boolean;
  successMessage?: string;
};
// All fifteen original literal requests retained; six previously uncovered GET cases added.
const cases: Contract[] = [
  {
    name: "applyUpdate",
    request: [
      "/settings/updates",
      {
        method: "POST",
        body: JSON.stringify({
          planId: "plan",
          passphrase: "secret",
          confirmation: "v1",
          approveDataLoss: false,
        }),
      },
    ],
    posted: [
      "/settings/updates",
      {
        planId: "plan",
        passphrase: "secret",
        confirmation: "v1",
        approveDataLoss: false,
      },
    ],
    response: operation,
    query: false,
    binary: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useApplyUpdate(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          planId: "plan",
          passphrase: "secret",
          confirmation: "v1",
          approveDataLoss: false,
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "changePassword",
    request: [
      "/auth/password",
      {
        method: "POST",
        body: JSON.stringify({
          current: "old",
          password: "new",
          code: "123456",
        }),
      },
    ],
    posted: [
      "/auth/password",
      { current: "old", password: "new", code: "123456" },
    ],
    response: session,
    query: false,
    binary: false,
    successMessage: "Password changed",
    run: async (client) => {
      const { result } = renderHook(
        () => useChangePassword(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          current: "old",
          password: "new",
          code: "123456",
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "checkForUpdates",
    request: [
      "/settings/updates/check",
      { method: "POST", body: JSON.stringify({}) },
    ],
    posted: ["/settings/updates/check", {}],
    response: status,
    query: false,
    binary: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useCheckForUpdates(),
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
    name: "disableTOTP",
    request: [
      "/auth/totp/disable",
      {
        method: "POST",
        body: JSON.stringify({ password: "secret", code: "123456" }),
      },
    ],
    posted: ["/auth/totp/disable", { password: "secret", code: "123456" }],
    response: { ok: true },
    query: false,
    binary: false,
    successMessage: "Authenticator disabled",
    run: async (client) => {
      const { result } = renderHook(
        () => useDisableTOTP(),
        renderWithClient(client),
      );
      act(() => result.current.mutate({ password: "secret", code: "123456" }));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "downloadBackup",
    request: [
      "/backup",
      { method: "POST", body: JSON.stringify({ passphrase: "secret" }) },
    ],
    posted: ["/backup", { passphrase: "secret" }],
    response: "encrypted",
    query: false,
    binary: true,
    successMessage: "Encrypted backup downloaded",
    run: async (client) => {
      const { result } = renderHook(
        () => useDownloadBackup(),
        renderWithClient(client),
      );
      act(() => result.current.mutate({ passphrase: "secret" }));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "enableTOTP",
    request: [
      "/auth/totp/confirm",
      { method: "POST", body: JSON.stringify({ code: "123456" }) },
    ],
    posted: ["/auth/totp/confirm", { code: "123456" }],
    response: { recoveryCodes: ["recovery"] },
    query: false,
    binary: false,
    successMessage: "Authenticator enabled",
    run: async (client) => {
      const { result } = renderHook(
        () => useEnableTOTP(),
        renderWithClient(client),
      );
      act(() => result.current.mutate({ code: "123456" }));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "planUpdate",
    request: [
      "/settings/updates/plan",
      { method: "POST", body: JSON.stringify({ target: "v1" }) },
    ],
    posted: ["/settings/updates/plan", { target: "v1" }],
    response: plan,
    query: false,
    binary: false,
    run: async (client) => {
      const { result } = renderHook(
        () => usePlanUpdate(),
        renderWithClient(client),
      );
      act(() => result.current.mutate({ target: "v1" }));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "regenerateRecoveryCodes",
    request: [
      "/auth/totp/start",
      { method: "POST", body: JSON.stringify({ password: "secret" }) },
    ],
    posted: ["/auth/totp/start", { password: "secret" }],
    response: { secret: "secret", url: "otpauth://totp/shipyard" },
    query: false,
    binary: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useStartTOTP(),
        renderWithClient(client),
      );
      act(() => result.current.mutate({ password: "secret" }));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "setMaintenanceMode",
    request: [
      "/settings/maintenance",
      { method: "POST", body: JSON.stringify({ enabled: true }) },
    ],
    posted: ["/settings/maintenance", { enabled: true }],
    response: { enabled: true },
    query: false,
    binary: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSetMaintenanceMode(),
        renderWithClient(client),
      );
      act(() => result.current.mutate(true));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "download update backup",
    request: ["/settings/updates/a%2Fb%3Fc/backup"],
    response: "encrypted",
    query: false,
    binary: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useDownloadUpdateBackup(),
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
    name: "alert policy",
    request: [
      "/settings/alerts",
      { method: "PUT", body: JSON.stringify(policy) },
    ],
    response: policy,
    query: false,
    binary: false,
    successMessage: "Alert policy saved",
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveAlertPolicy(),
        renderWithClient(client),
      );
      act(() => result.current.mutate(policy));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "dashboard save",
    request: [
      "/settings/dashboard-access",
      {
        method: "PUT",
        body: '{"version":3,"domain":"dash.test","acmeEmail":"u@example.test","acceptTos":true}',
      },
    ],
    response: { jobId: "job" },
    query: false,
    binary: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveDashboardAccess(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          retry: false,
          payload: {
            version: 3,
            domain: "dash.test",
            acmeEmail: "u@example.test",
            acceptTos: true,
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
    name: "dashboard retry",
    request: [
      "/settings/dashboard-access/retry",
      { method: "POST", body: '{"version":3}' },
    ],
    response: { jobId: "job" },
    query: false,
    binary: false,
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveDashboardAccess(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({ retry: true, payload: { version: 3 } }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "update user",
    request: ["/users/a%2Fb%3Fc", { method: "PUT", body: '{"admin":true}' }],
    response: { ok: true },
    query: false,
    binary: false,
    successMessage: "User access updated",
    run: async (client) => {
      const { result } = renderHook(
        () => useUpdateUser(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          id: "a/b?c",
          access: { admin: true, disabled: undefined },
        }),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "preserve undefined user",
    request: ["/users/undefined", { method: "PUT", body: "{}" }],
    response: { ok: true },
    query: false,
    binary: false,
    successMessage: "User access updated",
    run: async (client) => {
      const { result } = renderHook(
        () => useUpdateUser(),
        renderWithClient(client),
      );
      act(() =>
        result.current.mutate({
          id: undefined,
          access: {
            admin: undefined,
            disabled: undefined,
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
    name: "/settings/alerts",
    request: ["/settings/alerts"],
    response: policy,
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useAlertPolicy(),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "/settings/dashboard-access",
    request: ["/settings/dashboard-access"],
    response: dashboard,
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useDashboardAccess(),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "/settings/updates",
    request: ["/settings/updates"],
    response: status,
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useSystemUpdates(),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "/audit",
    request: ["/audit"],
    response: [{ id: "audit", createdAt: "2026-10-19" }],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useHistory("audit"),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "/jobs",
    request: ["/jobs"],
    response: [{ id: "job", attempts: 1 }],
    query: true,
    run: async (client) => {
      const { result } = renderHook(
        () => useHistory("jobs"),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "/users",
    request: ["/users"],
    response: [
      {
        id: "user",
        name: "User",
        email: "u@example.test",
        admin: true,
        disabled: false,
        totp: false,
      },
    ],
    query: true,
    run: async (client) => {
      const { result } = renderHook(() => useUsers(), renderWithClient(client));
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

describe("settings surface request contracts", () => {
  it.each(cases)(
    "$name preserves the complete request",
    async ({
      run,
      request,
      posted,
      response,
      successMessage,
      query,
      binary,
    }) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(binary ? String(response) : JSON.stringify(response), {
          headers: {
            "Content-Type": binary
              ? "application/octet-stream"
              : "application/json",
          },
        }),
      );
      vi.stubGlobal("fetch", fetch);
      expect(await run(client)).toBeNull();
      expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/v1" + request[0], {
        method: "GET",
        body: undefined,
        signal: query ? expect.any(AbortSignal) : undefined,
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
    async ({ run, request, query, binary }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response('{"invalid":true}', {
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );
      const error = await run(client);
      expect(error?.error).toMatchObject({
        kind: binary ? "parse" : "schema",
        path: request[0],
      });
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledTimes(query ? 0 : 1);
    },
  );
});

it("rotates CSRF and updates the session cache before the password callback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(session))),
  );
  const { result } = renderHook(
    () => useChangePassword(),
    renderWithClient(client),
  );
  const callback = vi.fn(() => {
    expect(getCSRF()).toBe("rotated-csrf");
    expect(client.getQueryData(sessionKeys.all)).toEqual(session);
  });
  act(() =>
    result.current.mutate(
      { current: "old", password: "long-new-password", code: "123456" },
      { onSuccess: callback },
    ),
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(callback).toHaveBeenCalledTimes(1);
});
