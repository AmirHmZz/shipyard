import type { QueryClient } from "@tanstack/react-query";

import { MutationObserver, QueryObserver } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Resource } from "@/lib/api/types";

import { ApiException } from "@/lib/api/errors";
import { dockerNetworkKeys, resourceKeys } from "@/lib/query-keys";
import { createTestClient } from "@/test/renderWithClient";

import type { DockerNetwork } from "../generics";

import { networkRemovalPolicy } from "./useRemoveNetwork";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));

function deferred() {
  function missingResolver() {
    throw new Error("Request is not initialized");
  }
  let resolve: (value: unknown) => void = missingResolver;
  let reject: (reason: unknown) => void = missingResolver;
  const promise = new Promise<unknown>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return {
    promise,
    resolve(value: unknown) {
      resolve(value);
    },
    reject(reason: unknown) {
      reject(reason);
    },
  };
}
function resource(id: string, managed = true): Resource {
  return {
    id,
    name: id,
    kind: "network",
    parentId: "server",
    teamId: "team",
    data: { managed, dockerId: "docker-" + id, serverId: "server" },
    variables: {},
    secretKeys: [],
    canWrite: true,
    version: 1,
    createdAt: "2026-10-20T00:00:00Z",
    updatedAt: "2026-10-20T00:00:00Z",
  };
}
function docker(id: string, managed = true): DockerNetwork {
  return {
    Id: "docker-" + id,
    Name: id,
    Driver: "bridge",
    EnableIPv6: false,
    IPAM: {},
    Containers: {},
    Labels: managed ? { "shipyard.network": id } : {},
  };
}
const resources = [
  resource("first"),
  resource("second"),
  resource("external", false),
];
const inventory = [
  docker("first"),
  docker("second"),
  docker("external", false),
];
const inventoryKey = dockerNetworkKeys.server("server");
const failure = new ApiException({
  kind: "http",
  path: "/resources/first",
  status: 409,
  message: "Network still in use",
});
let client: QueryClient;
let readers: (() => void)[] = [];
beforeEach(() => {
  client = createTestClient();
  client.setQueryData(resourceKeys.all, resources);
  client.setQueryData(inventoryKey, inventory);
  vi.clearAllMocks();
});
afterEach(() => {
  for (const stop of readers) stop();
  readers = [];
  client.clear();
});
function watchResources(queryFn: () => Promise<unknown>) {
  const observer = new QueryObserver(client, {
    queryKey: resourceKeys.all,
    queryFn,
    staleTime: Infinity,
  });
  readers.push(observer.subscribe(() => {}));
}

it("removes a managed network from resources and all inventories immediately, then waits for refetch", async () => {
  const request = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watchResources(fetch);
  client.setQueryData(dockerNetworkKeys.server("another"), [docker("first")]);
  const cancel = vi.spyOn(client, "cancelQueries");
  const observer = new MutationObserver(client, {
    ...networkRemovalPolicy(),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("first");
  await vi.waitFor(() =>
    expect(client.getQueryData(resourceKeys.all)).toEqual(resources.slice(1)),
  );
  expect(client.getQueryData(inventoryKey)).toEqual(inventory.slice(1));
  expect(client.getQueryData(dockerNetworkKeys.server("another"))).toEqual([]);
  expect(cancel).toHaveBeenCalledWith({ queryKey: resourceKeys.all });
  expect(cancel).toHaveBeenCalledWith({ queryKey: dockerNetworkKeys.all });
  request.resolve({ ok: true });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(observer.getCurrentResult().isPending).toBe(true);
  refresh.resolve(resources.slice(1));
  await completion;
  expect(observer.getCurrentResult().isSuccess).toBe(true);
});

it("restores both caches before refetch on failure and reports one global toast", async () => {
  const request = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watchResources(fetch);
  const observer = new MutationObserver(client, {
    ...networkRemovalPolicy(),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("first").catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData(resourceKeys.all)).toEqual(resources.slice(1)),
  );
  request.reject(failure);
  await vi.waitFor(() =>
    expect(client.getQueryData(resourceKeys.all)).toEqual(resources),
  );
  expect(client.getQueryData(inventoryKey)).toEqual(inventory);
  expect(toast.error).toHaveBeenCalledTimes(1);
  expect(observer.getCurrentResult().isPending).toBe(true);
  refresh.resolve(resources);
  expect(await completion).toBe(failure);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("preserves the external Docker network while optimistically unregistering its resource", async () => {
  const request = deferred();
  const observer = new MutationObserver(client, {
    ...networkRemovalPolicy(),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("external");
  await vi.waitFor(() =>
    expect(client.getQueryData(resourceKeys.all)).toEqual(
      resources.slice(0, 2),
    ),
  );
  expect(client.getQueryData(inventoryKey)).toEqual(inventory);
  request.resolve({ ok: true });
  await completion;
});

it("rolls back only the failed network during concurrent removals and refetches after the last request", async () => {
  const first = deferred(),
    second = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watchResources(fetch);
  const a = new MutationObserver(client, {
    ...networkRemovalPolicy(),
    mutationFn: () => first.promise,
  });
  const b = new MutationObserver(client, {
    ...networkRemovalPolicy(),
    mutationFn: () => second.promise,
  });
  const aCompletion = a.mutate("first").catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData(resourceKeys.all)).toEqual(resources.slice(1)),
  );
  const bCompletion = b.mutate("second");
  await vi.waitFor(() =>
    expect(client.getQueryData(resourceKeys.all)).toEqual([resources[2]]),
  );
  second.resolve({ ok: true });
  await bCompletion;
  expect(fetch).not.toHaveBeenCalled();
  first.reject(failure);
  await vi.waitFor(() =>
    expect(client.getQueryData(resourceKeys.all)).toEqual([
      resources[0],
      resources[2],
    ]),
  );
  expect(client.getQueryData(inventoryKey)).toEqual([
    inventory[0],
    inventory[2],
  ]);
  refresh.resolve([resources[0], resources[2]]);
  expect(await aCompletion).toBe(failure);
  expect(fetch).toHaveBeenCalledTimes(1);
});
