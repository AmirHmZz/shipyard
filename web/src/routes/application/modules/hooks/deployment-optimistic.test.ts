import type { QueryClient } from "@tanstack/react-query";

import { MutationObserver, QueryObserver } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Deployment } from "@/lib/api/types";

import { ApiException } from "@/lib/api/errors";
import { deploymentKeys } from "@/lib/query-keys";
import { createTestClient } from "@/test/renderWithClient";

import { applicationKeys } from "../generics";
import { deploymentRemovalPolicy } from "./useRemoveDeployment";

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
function deployment(id: string): Deployment {
  return {
    id,
    applicationId: "app",
    state: "succeeded",
    phase: "done",
    commit: id,
    error: "",
    releaseId: "release-" + id,
    rollbackId: "",
    createdAt: "",
    updatedAt: "",
    deleting: false,
    deletionError: "previous failure",
  };
}
const deployments = [deployment("first"), deployment("second")];
const globalKey = deploymentKeys.list();
const appKey = deploymentKeys.list("app");
const selectedKey = applicationKeys.deployment("first");
const failure = new ApiException({
  kind: "http",
  status: 409,
  path: "/deployments/first",
  message: "Active deployment cannot be removed",
});
let client: QueryClient;
let unsubscribe: (() => void) | undefined;
beforeEach(() => {
  client = createTestClient();
  client.setQueryData(globalKey, deployments);
  client.setQueryData(appKey, deployments);
  client.setQueryData(selectedKey, deployments[0]);
  vi.clearAllMocks();
});
afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  client.clear();
});
function watch(queryFn: () => Promise<unknown>) {
  const reader = new QueryObserver(client, {
    queryKey: globalKey,
    queryFn,
    staleTime: Infinity,
  });
  unsubscribe = reader.subscribe(() => {});
}
it("marks history rows and the selected deployment as deleting without hiding retained history, then waits for refetch", async () => {
  const request = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watch(fetch);
  const cancel = vi.spyOn(client, "cancelQueries");
  const observer = new MutationObserver(client, {
    ...deploymentRemovalPolicy(),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("first");
  const expected = [
    { ...deployments[0], deleting: true, deletionError: "" },
    deployments[1],
  ];
  await vi.waitFor(() =>
    expect(client.getQueryData(globalKey)).toEqual(expected),
  );
  expect(client.getQueryData(appKey)).toEqual(expected);
  expect(client.getQueryData(selectedKey)).toEqual(expected[0]);
  expect(cancel).toHaveBeenCalledWith({ queryKey: deploymentKeys.all });
  expect(cancel).toHaveBeenCalledWith({ queryKey: selectedKey });
  request.resolve({ jobId: "cleanup" });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(observer.getCurrentResult().isPending).toBe(true);
  refresh.resolve(expected);
  await completion;
});
it("restores only cleanup flags on failure, retaining newer deployment fields and one global error toast", async () => {
  const request = deferred();
  const observer = new MutationObserver(client, {
    ...deploymentRemovalPolicy(),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("first").catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData<Deployment>(selectedKey)?.deleting).toBe(true),
  );
  client.setQueryData<Deployment>(selectedKey, (current) =>
    current ? { ...current, commit: "updated" } : current,
  );
  request.reject(failure);
  expect(await completion).toBe(failure);
  expect(client.getQueryData(globalKey)).toEqual(deployments);
  expect(client.getQueryData(appKey)).toEqual(deployments);
  expect(client.getQueryData(selectedKey)).toEqual({
    ...deployments[0],
    commit: "updated",
  });
  expect(toast.error).toHaveBeenCalledTimes(1);
});
it("does not undo another queued deletion and invalidates only after the last pending cleanup", async () => {
  const first = deferred(),
    second = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watch(fetch);
  const a = new MutationObserver(client, {
    ...deploymentRemovalPolicy(),
    mutationFn: () => first.promise,
  });
  const b = new MutationObserver(client, {
    ...deploymentRemovalPolicy(),
    mutationFn: () => second.promise,
  });
  const aCompletion = a.mutate("first").catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData<Deployment[]>(globalKey)?.[0].deleting).toBe(
      true,
    ),
  );
  const bCompletion = b.mutate("second");
  await vi.waitFor(() =>
    expect(client.getQueryData<Deployment[]>(globalKey)?.[1].deleting).toBe(
      true,
    ),
  );
  second.resolve({ jobId: "second" });
  await bCompletion;
  expect(fetch).not.toHaveBeenCalled();
  first.reject(failure);
  const expected = [
    deployments[0],
    { ...deployments[1], deleting: true, deletionError: "" },
  ];
  await vi.waitFor(() =>
    expect(client.getQueryData(globalKey)).toEqual(expected),
  );
  refresh.resolve(expected);
  expect(await aCompletion).toBe(failure);
  expect(fetch).toHaveBeenCalledTimes(1);
});
