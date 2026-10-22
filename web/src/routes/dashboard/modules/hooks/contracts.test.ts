// @vitest-environment jsdom
// @vitest-environment jsdom
// @vitest-environment jsdom
// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiException } from "@/lib/api/errors";

import { getCSRF, setCSRF } from "@/lib/api/csrf";
import { reportError } from "@/lib/telemetry";
import { createTestClient, renderWithClient } from "@/test/renderWithClient";

import { useLogout } from "./useLogout";
import { useSession } from "./useSession";
import { useSetupStatus } from "./useSetupStatus";
import { useSubmitAuth } from "./useSubmitAuth";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));

import { resourceKeys, sessionKeys } from "@/lib/query-keys";
const auth = {
  name: "User",
  email: "u@example.test",
  password: "password",
  code: "123456",
  token: "invite",
};
const session = {
  user: {
    id: "user",
    name: "User",
    email: "u@example.test",
    admin: true,
    totp: false,
  },
  csrf: "new-token",
};
type Contract = {
  name: string;
  run: (client: QueryClient) => Promise<ApiException | null>;
  request: [string, { method: string; body: string }?];
  posted?: [string, unknown?];
  response: unknown;
  successMessage?: string;
};
// Four original literal mutation requests retained; two GET contracts and the original session lifecycle cases now exercise real adapters.
const cases: Contract[] = [
  {
    name: "logout",
    request: ["/auth/logout", { method: "POST", body: "{}" }],
    posted: ["/auth/logout"],
    response: { ok: true },
    run: async (client) => {
      const { result } = renderHook(
        () => useLogout(),
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
    name: "auth login",
    request: ["/auth/login", { method: "POST", body: JSON.stringify(auth) }],
    posted: ["/auth/login", auth],
    response: session,
    run: async (client) => {
      const { result } = renderHook(
        () => useSubmitAuth("login"),
        renderWithClient(client),
      );
      act(() => result.current.mutate(auth));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "auth accept",
    request: ["/auth/accept", { method: "POST", body: JSON.stringify(auth) }],
    posted: ["/auth/accept", auth],
    response: session,
    run: async (client) => {
      const { result } = renderHook(
        () => useSubmitAuth("accept"),
        renderWithClient(client),
      );
      act(() => result.current.mutate(auth));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "auth setup",
    request: ["/auth/setup", { method: "POST", body: JSON.stringify(auth) }],
    posted: ["/auth/setup", auth],
    response: session,
    run: async (client) => {
      const { result } = renderHook(
        () => useSubmitAuth("setup"),
        renderWithClient(client),
      );
      act(() => result.current.mutate(auth));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "setup status",
    request: ["/auth/status"],
    response: { setupRequired: false, setupEnabled: true },
    run: async (client) => {
      const { result } = renderHook(
        () => useSetupStatus(),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "existing session",
    request: ["/auth/me"],
    response: session,
    run: async (client) => {
      const { result } = renderHook(
        () => useSession(),
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

describe("dashboard surface request contracts", () => {
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

describe("session lifecycle", () => {
  it.each(["login", "setup", "accept"] as const)(
    "captures CSRF, clears other-user caches and stores the validated %s session before the callback",
    async (mode) => {
      client.setQueryData(resourceKeys.all, [{ id: "previous-user-resource" }]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(session))),
      );
      const { result } = renderHook(
        () => useSubmitAuth(mode),
        renderWithClient(client),
      );
      const callback = vi.fn(() => {
        expect(getCSRF()).toBe("new-token");
        expect(client.getQueryData(sessionKeys.all)).toEqual(session);
        expect(client.getQueryData(resourceKeys.all)).toBeUndefined();
      });
      act(() => result.current.mutate(auth, { onSuccess: callback }));
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );
  it("captures the token after the existing session request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(session))),
    );
    const { result } = renderHook(() => useSession(), renderWithClient(client));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(session);
    expect(getCSRF()).toBe("new-token");
  });
  it("treats an unauthorized session as signed out and clears its token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "signed out" }), {
          status: 401,
        }),
      ),
    );
    const { result } = renderHook(() => useSession(), renderWithClient(client));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(getCSRF()).toBe("");
    expect(toast.error).not.toHaveBeenCalled();
  });
  it("propagates other session failures and preserves the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "offline" }), { status: 503 }),
        ),
    );
    const { result } = renderHook(() => useSession(), renderWithClient(client));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.error).toEqual({
      kind: "http",
      path: "/auth/me",
      status: 503,
      message: "offline",
    });
    expect(getCSRF()).toBe("contract-csrf");
  });
  it("cancels pending reads before clearing account caches after logout", async () => {
    client.setQueryData(sessionKeys.all, session);
    client.setQueryData(resourceKeys.all, [{ id: "private" }]);
    const cancel = vi.spyOn(client, "cancelQueries");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"ok":true}')),
    );
    const { result } = renderHook(() => useLogout(), renderWithClient(client));
    const callback = vi.fn(() => {
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(client.getQueryData(sessionKeys.all)).toBeNull();
      expect(client.getQueryData(resourceKeys.all)).toBeUndefined();
      expect(getCSRF()).toBe("");
    });
    act(() => result.current.mutate(undefined, { onSuccess: callback }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
