import type { QueryClient } from "@tanstack/react-query";

import { MutationObserver, QueryObserver } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiException } from "@/lib/api/errors";
import { createTestClient } from "@/test/renderWithClient";

import type { TeamMembersResponse } from "../generics";

import { teamKeys } from "../generics";
import { memberRemovalPolicy } from "./useRemoveTeamMember";

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
const members: TeamMembersResponse = [
  { id: "actor", name: "Owner", email: "owner@example.test", role: "owner" },
  { id: "first", name: "First", email: "first@example.test", role: "member" },
  {
    id: "second",
    name: "Second",
    email: "second@example.test",
    role: "member",
  },
];
const failure = new ApiException({
  kind: "http",
  path: "/teams/team/members/first",
  status: 409,
  message: "Membership changed",
});
let client: QueryClient;
let readers: (() => void)[] = [];
beforeEach(() => {
  client = createTestClient();
  client.setQueryData(teamKeys.members("team"), members);
  vi.clearAllMocks();
});
afterEach(() => {
  for (const stop of readers) stop();
  readers = [];
  client.clear();
});
function watchMembers(queryFn: () => Promise<unknown>) {
  const observer = new QueryObserver(client, {
    queryKey: teamKeys.members("team"),
    queryFn,
    staleTime: Infinity,
  });
  readers.push(observer.subscribe(() => {}));
}

it("removes immediately, cancels polling, and stays pending until the settling refetch completes", async () => {
  const request = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watchMembers(fetch);
  const cancel = vi.spyOn(client, "cancelQueries");
  const observer = new MutationObserver(client, {
    ...memberRemovalPolicy("team"),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("first");
  await vi.waitFor(() =>
    expect(client.getQueryData(teamKeys.members("team"))).toEqual([
      members[0],
      members[2],
    ]),
  );
  expect(cancel).toHaveBeenCalledExactlyOnceWith({
    queryKey: teamKeys.members("team"),
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
  watchMembers(fetch);
  const observer = new MutationObserver(client, {
    ...memberRemovalPolicy("team"),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("first").catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData(teamKeys.members("team"))).toEqual([
      members[0],
      members[2],
    ]),
  );
  request.reject(failure);
  await vi.waitFor(() =>
    expect(client.getQueryData(teamKeys.members("team"))).toEqual(members),
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
  watchMembers(fetch);
  const a = new MutationObserver(client, {
    ...memberRemovalPolicy("team"),
    mutationFn: () => first.promise,
  });
  const b = new MutationObserver(client, {
    ...memberRemovalPolicy("team"),
    mutationFn: () => second.promise,
  });
  const firstCompletion = a.mutate("first").catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData(teamKeys.members("team"))).toEqual([
      members[0],
      members[2],
    ]),
  );
  const secondCompletion = b.mutate("second");
  await vi.waitFor(() =>
    expect(client.getQueryData(teamKeys.members("team"))).toEqual([members[0]]),
  );
  second.resolve({ ok: true });
  await secondCompletion;
  expect(fetch).not.toHaveBeenCalled();
  first.reject(failure);
  await vi.waitFor(() =>
    expect(client.getQueryData(teamKeys.members("team"))).toEqual([
      members[0],
      members[1],
    ]),
  );
  refresh.resolve([members[0], members[1]]);
  expect(await firstCompletion).toBe(failure);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps a pending rollback scoped to its original team after the observer changes teams", async () => {
  const request = deferred(),
    refresh = deferred();
  const fetch = vi.fn(() => refresh.promise);
  watchMembers(fetch);
  client.setQueryData(teamKeys.members("other-team"), [members[2]]);
  const observer = new MutationObserver(client, {
    ...memberRemovalPolicy("team"),
    mutationFn: () => request.promise,
  });
  const completion = observer.mutate("first").catch((error: unknown) => error);
  await vi.waitFor(() =>
    expect(client.getQueryData(teamKeys.members("team"))).toEqual([
      members[0],
      members[2],
    ]),
  );
  observer.setOptions({
    ...memberRemovalPolicy("other-team"),
    mutationFn: () => request.promise,
  });
  request.reject(failure);
  await vi.waitFor(() =>
    expect(client.getQueryData(teamKeys.members("team"))).toEqual(members),
  );
  expect(client.getQueryData(teamKeys.members("other-team"))).toEqual([
    members[2],
  ]);
  refresh.resolve(members);
  expect(await completion).toBe(failure);
  expect(fetch).toHaveBeenCalledTimes(1);
});
