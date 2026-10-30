// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { Resource } from "@/lib/api/types";

import { resourceKeys } from "@/lib/query-keys";
import { orderedCards } from "@/lib/resource-card-order";
import { createTestClient, renderWithClient } from "@/test/renderWithClient";

import { useMoveResource } from "./useMoveResource";
import { useSaveResourceLogo } from "./useSaveResourceLogo";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function card(id: string, sortOrder: number): Resource {
  return {
    id,
    name: id,
    kind: "project",
    teamId: "team",
    parentId: "team",
    data: {},
    variables: {},
    secretKeys: [],
    version: 1,
    canWrite: true,
    createdAt: "",
    updatedAt: "",
    sortOrder,
  };
}

it("updates ordering immediately and restores it after a rejected move", async () => {
  const client = createTestClient();
  const rows = [card("a", 1), card("hidden", 2), card("b", 3)];
  client.setQueryData(resourceKeys.all, rows);
  let reject: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          reject = resolve;
        }),
    ),
  );
  const { result } = renderHook(useMoveResource, {
    ...renderWithClient(client),
  });
  act(() => result.current.mutate({ id: "b", beforeId: "a" }));
  await waitFor(() =>
    expect(
      orderedCards(client.getQueryData<Resource[]>(resourceKeys.all) || []).map(
        (row) => row.id,
      ),
    ).toEqual(["b", "a", "hidden"]),
  );
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/resources/b/move",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ beforeId: "a" }),
    }),
  );
  await act(async () => {
    if (!reject) throw new Error("Move request was not started");
    reject(
      new Response(JSON.stringify({ error: "Card changed" }), { status: 409 }),
    );
  });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(client.getQueryData(resourceKeys.all)).toEqual(rows);
  client.clear();
});

it("saves a logo through its own endpoint and preserves deployment drafts", async () => {
  const client = createTestClient();
  const resource = card("a", 1);
  client.setQueryData(resourceKeys.all, [resource]);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...resource, logoUrl: "/logo?v=2" })),
      ),
  );
  const { result } = renderHook(() => useSaveResourceLogo("a"), {
    ...renderWithClient(client),
  });
  await act(async () => {
    await result.current.mutateAsync("aW1hZ2U=");
  });
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/resources/a/logo",
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ image: "aW1hZ2U=" }),
    }),
  );
  expect(client.getQueryData(resourceKeys.all)).toEqual([
    { ...resource, logoUrl: "/logo?v=2" },
  ]);
  client.clear();
});
