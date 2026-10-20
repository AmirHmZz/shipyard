import { MutationObserver } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/mini";

import { reportError } from "@/lib/telemetry";

import type { ApiMeta } from "./query-client";

import { ApiException } from "./errors";
import { createQueryClient } from "./query-client";
import { toastApiError, toastValidationError } from "./toaster";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const failure = new ApiException({
  kind: "http",
  path: "/items",
  status: 409,
  message: "Conflict",
});
describe("cache notification policy", () => {
  it("retains the application's query defaults", () => {
    expect(createQueryClient().getDefaultOptions().queries).toEqual({
      retry: 1,
      staleTime: 5000,
      refetchOnWindowFocus: false,
    });
  });
  it.each([false, true])(
    "toasts a mutation error once unless silent=%s",
    async (silent) => {
      const client = createQueryClient();
      const observer = new MutationObserver(client, {
        mutationFn: () => Promise.reject(failure),
        meta: { silent },
      });
      await expect(observer.mutate()).rejects.toBe(failure);
      expect(toast.error).toHaveBeenCalledTimes(silent ? 0 : 1);
      client.clear();
    },
  );
  it.each([false, true])(
    "query errors toast only with meta.toast=%s",
    async (notify) => {
      const client = createQueryClient();
      const meta: ApiMeta = { toast: notify };
      await expect(
        client.fetchQuery({
          queryKey: ["test"],
          retry: false,
          queryFn: () => Promise.reject(failure),
          meta,
        }),
      ).rejects.toBe(failure);
      expect(toast.error).toHaveBeenCalledTimes(notify ? 1 : 0);
      client.clear();
    },
  );
  it("shows static mutation success messages", async () => {
    const client = createQueryClient();
    const observer = new MutationObserver(client, {
      mutationFn: () => Promise.resolve({}),
      meta: { successMessage: "Saved" },
    });
    await observer.mutate();
    expect(toast.success).toHaveBeenCalledExactlyOnceWith("Saved", {
      id: "api-success:Saved",
    });
    client.clear();
  });
  it("reports unexpected responses even for queries without toasts", async () => {
    const client = createQueryClient();
    await expect(
      client.fetchQuery({
        queryKey: ["unexpected"],
        retry: false,
        queryFn: () =>
          Promise.reject(new ApiException({ kind: "parse", path: "/items" })),
      }),
    ).rejects.toBeInstanceOf(ApiException);
    expect(reportError).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
    client.clear();
  });
  it("leaves legacy notifications alone during migration", async () => {
    const client = createQueryClient();
    const observer = new MutationObserver(client, {
      mutationFn: () => Promise.reject(new Error("legacy")),
    });
    await expect(observer.mutate()).rejects.toThrow("legacy");
    expect(toast.error).not.toHaveBeenCalled();
    client.clear();
  });
  it("suppresses cancellations and gives repeated errors stable toast ids", () => {
    toastApiError({ kind: "aborted", path: "/items" });
    expect(toast.error).not.toHaveBeenCalled();
    toastApiError(failure.error);
    toastApiError(failure.error);
    expect(toast.error).toHaveBeenNthCalledWith(1, "Conflict", {
      id: "api:/items:Conflict",
    });
    expect(toast.error).toHaveBeenNthCalledWith(2, "Conflict", {
      id: "api:/items:Conflict",
    });
  });
  it("centralizes validation notifications", () => {
    const parsed = z.safeParse(
      z.string().check(z.minLength(1, "Required.")),
      "",
    );
    if (parsed.success) throw new Error("Expected validation failure");
    toastValidationError(parsed.error);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Required.", {
      id: "validation:Required.",
    });
  });
});
