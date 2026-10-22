import type { QueryClient } from "@tanstack/react-query";

import { MutationObserver, QueryObserver } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { DNSRecord } from "@/lib/api/types";

import { ApiException } from "@/lib/api/errors";
import { createTestClient } from "@/test/renderWithClient";

import { dnsKeys } from "../generics";
import { dnsRecordRemovalPolicy } from "./useRemoveDNSRecord";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));

function deferred() {
  function missingResolver() {
    throw new Error("Deferred request was not initialized");
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
const members: DNSRecord[] = [
  {
    id: "actor",
    type: "A",
    name: "owner.example.test",
    content: "192.0.2.1",
    ttl: 120,
    proxied: false,
  },
  {
    id: "first",
    type: "A",
    name: "first.example.test",
    content: "192.0.2.2",
    ttl: 120,
    proxied: false,
  },
  {
    id: "second",
    type: "A",
    name: "second.example.test",
    content: "192.0.2.3",
    ttl: 120,
    proxied: false,
  },
];
const failure = new ApiException({
  kind: "http",
  path: "/zones/zone/records/first",
  status: 409,
  message: "Membership changed",
});
let client: QueryClient;
let readers: (() => void)[] = [];
beforeEach(() => {
  client = createTestClient();
  client.setQueryData(dnsKeys.records("zone"), members);
  vi.clearAllMocks();
});
afterEach(() => {
  for (const stop of readers) stop();
  readers = [];
  client.clear();
});
function watchRecords(queryFn: () => Promise<unknown>) {
  const observer = new QueryObserver(client, {
    queryKey: dnsKeys.records("zone"),
    queryFn,
    staleTime: Infinity,
  });
  readers.push(observer.subscribe(() => {}));
}

it("removes immediately, cancels polling, and stays pending until the settling refetch completes", async () => {
  const request = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watchRecords(fetch);
  const cancel = vi.spyOn(client, "cancelQueries");
  const observer = new MutationObserver(client, {
    ...dnsRecordRemovalPolicy("zone"),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("first");
  await vi.waitFor(() =>
    expect(client.getQueryData(dnsKeys.records("zone"))).toEqual([
      members[0],
      members[2],
    ]),
  );
  expect(cancel).toHaveBeenCalledExactlyOnceWith({
    queryKey: dnsKeys.records("zone"),
  });
  expect(fetch).not.toHaveBeenCalled();
  request.resolve({ ok: true });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(observer.getCurrentResult().isPending).toBe(true);
  refresh.resolve([members[0], members[2]]);
  await completion;
  expect(observer.getCurrentResult().isSuccess).toBe(true);
});

it("restores the failed row before refetching and leaves the error toast to the cache", async () => {
  const request = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watchRecords(fetch);
  const observer = new MutationObserver(client, {
    ...dnsRecordRemovalPolicy("zone"),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("first").catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData(dnsKeys.records("zone"))).toEqual([
      members[0],
      members[2],
    ]),
  );
  request.reject(failure);
  await vi.waitFor(() =>
    expect(client.getQueryData(dnsKeys.records("zone"))).toEqual(members),
  );
  expect(toast.error).toHaveBeenCalledTimes(1);
  expect(observer.getCurrentResult().isPending).toBe(true);
  refresh.resolve(members);
  expect(await completion).toBe(failure);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not resurrect a successful concurrent removal when an earlier request fails", async () => {
  const first = deferred(),
    second = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watchRecords(fetch);
  const a = new MutationObserver(client, {
    ...dnsRecordRemovalPolicy("zone"),
    mutationFn: () => first.promise,
  });
  const b = new MutationObserver(client, {
    ...dnsRecordRemovalPolicy("zone"),
    mutationFn: () => second.promise,
  });
  const firstCompletion = a.mutate("first").catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData(dnsKeys.records("zone"))).toEqual([
      members[0],
      members[2],
    ]),
  );
  const secondCompletion = b.mutate("second");
  await vi.waitFor(() =>
    expect(client.getQueryData(dnsKeys.records("zone"))).toEqual([members[0]]),
  );
  second.resolve({ ok: true });
  await secondCompletion;
  expect(fetch).not.toHaveBeenCalled();
  first.reject(failure);
  await vi.waitFor(() =>
    expect(client.getQueryData(dnsKeys.records("zone"))).toEqual([
      members[0],
      members[1],
    ]),
  );
  refresh.resolve([members[0], members[1]]);
  expect(await firstCompletion).toBe(failure);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps a pending rollback scoped to its original zone after the observer changes zones", async () => {
  const request = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watchRecords(fetch);
  client.setQueryData(dnsKeys.records("other-zone"), [members[2]]);
  const observer = new MutationObserver(client, {
    ...dnsRecordRemovalPolicy("zone"),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("first").catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData(dnsKeys.records("zone"))).toEqual([
      members[0],
      members[2],
    ]),
  );
  observer.setOptions({
    ...dnsRecordRemovalPolicy("other-zone"),
    mutationFn: () => request.promise,
  });
  request.reject(failure);
  await vi.waitFor(() =>
    expect(client.getQueryData(dnsKeys.records("zone"))).toEqual(members),
  );
  expect(client.getQueryData(dnsKeys.records("other-zone"))).toEqual([
    members[2],
  ]);
  refresh.resolve(members);
  expect(await completion).toBe(failure);
  expect(fetch).toHaveBeenCalledTimes(1);
});
