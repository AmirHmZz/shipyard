import type { QueryClient } from "@tanstack/react-query";

import { MutationObserver, QueryObserver } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Session } from "@/lib/api/types";

import { ApiException } from "@/lib/api/errors";
import { sessionKeys } from "@/lib/query-keys";
import { createTestClient } from "@/test/renderWithClient";

import { maintenancePolicy } from "./useSetMaintenanceMode";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));
function deferred() {
  function missing() {
    throw new Error("Request not initialized");
  }
  let resolve: (value: unknown) => void = missing,
    reject: (error: unknown) => void = missing;
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {
    promise,
    resolve(value: unknown) {
      resolve(value);
    },
    reject(error: unknown) {
      reject(error);
    },
  };
}
const session: Session = {
  user: {
    id: "actor",
    name: "Admin",
    email: "admin@example.test",
    admin: true,
    totp: false,
  },
  csrf: "original",
  maintenance: false,
};
const failure = new ApiException({
  kind: "http",
  status: 409,
  path: "/settings/maintenance",
  message: "Maintenance mode rejected",
});
let client: QueryClient;
let unsubscribe: (() => void) | undefined;
beforeEach(() => {
  client = createTestClient();
  client.setQueryData(sessionKeys.all, session);
  vi.clearAllMocks();
});
afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  client.clear();
});
it("updates the shared session immediately and stays pending until its refetch settles", async () => {
  const request = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  const reader = new QueryObserver(client, {
    queryKey: sessionKeys.all,
    queryFn: fetch,
    staleTime: Infinity,
  });
  unsubscribe = reader.subscribe(() => {});
  const cancel = vi.spyOn(client, "cancelQueries");
  const observer = new MutationObserver(client, {
    ...maintenancePolicy(),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate(true);
  await vi.waitFor(() =>
    expect(client.getQueryData(sessionKeys.all)).toEqual({
      ...session,
      maintenance: true,
    }),
  );
  expect(cancel).toHaveBeenCalledExactlyOnceWith({ queryKey: sessionKeys.all });
  request.resolve({ enabled: true });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(observer.getCurrentResult().isPending).toBe(true);
  refresh.resolve({ ...session, maintenance: true });
  await completion;
});
it("rolls back only maintenance while retaining a rotated CSRF token and updated account", async () => {
  const request = deferred();
  const observer = new MutationObserver(client, {
    ...maintenancePolicy(),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate(true).catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData<Session>(sessionKeys.all)?.maintenance).toBe(
      true,
    ),
  );
  const updated = {
    ...session,
    maintenance: true,
    csrf: "rotated",
    user: { ...session.user, name: "Updated" },
  };
  client.setQueryData(sessionKeys.all, updated);
  request.reject(failure);
  expect(await completion).toBe(failure);
  expect(client.getQueryData(sessionKeys.all)).toEqual({
    ...updated,
    maintenance: false,
  });
  expect(toast.error).toHaveBeenCalledTimes(1);
});
it.each([null, { ...session, user: { ...session.user, id: "other" } }])(
  "never restores an old session after logout or an account switch (%j)",
  async (replacement) => {
    const request = deferred();
    const observer = new MutationObserver(client, {
      ...maintenancePolicy(),
      mutationFn: () => request.promise,
    });
    const completion = observer.mutate(true).catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(client.getQueryData<Session>(sessionKeys.all)?.maintenance).toBe(
        true,
      ),
    );
    client.setQueryData(sessionKeys.all, replacement);
    request.reject(failure);
    expect(await completion).toBe(failure);
    expect(client.getQueryData(sessionKeys.all)).toEqual(replacement);
  },
);
