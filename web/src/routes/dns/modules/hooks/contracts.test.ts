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

import { useDNSRecords } from "./useDNSRecords";
import { useRemoveDNSRecord } from "./useRemoveDNSRecord";
import { useSaveDNSRecord } from "./useSaveDNSRecord";
import { useZoneCertificates } from "./useZoneCertificates";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));
type Contract = {
  name: string;
  run: (client: QueryClient) => Promise<ApiException | null>;
  request: [string, { method: string; body: string }?];
  posted?: [string, unknown];
  response: unknown;
  successMessage?: string;
};
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
const record = {
  type: "A",
  name: "example.test",
  content: "192.0.2.1",
  ttl: 120,
  proxied: false,
};
const certificate = {
  ownerType: "application",
  routeId: "route",
  applicationId: "app",
  domain: "app.example.com",
  certificateDomain: "app.example.com",
  status: "pending",
  hasCertificate: false,
  issuer: "",
  names: [],
  validFrom: null,
  expiresAt: null,
  renewalAt: null,
  serialNumber: "",
  fingerprint: "",
  authority: "",
  error: "",
};
// All ten literal URL/method/body cases retained from the former services tests.
const cases: Contract[] = [
  {
    name: "get records id",
    request: ["/zones/id/records"],
    response: [record],
    run: async (client) => {
      const { result } = renderHook(
        () => useDNSRecords({ ...resource, id: "id" }),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "certificates id",
    request: ["/zones/id/certificates"],
    response: [certificate],
    run: async (client) => {
      const { result } = renderHook(
        () => useZoneCertificates({ ...resource, id: "id" }),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "delete record id",
    request: ["/zones/id/records/id", { method: "DELETE", body: "{}" }],
    response: { ok: true },
    run: async (client) => {
      const { result } = renderHook(
        () => useRemoveDNSRecord("id"),
        renderWithClient(client),
      );
      act(() => result.current.mutate("id"));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "create record id",
    request: [
      "/zones/id/records",
      { method: "POST", body: JSON.stringify(record) },
    ],
    response: record,
    successMessage: "DNS record saved",
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveDNSRecord("id", undefined),
        renderWithClient(client),
      );
      act(() => result.current.mutate(record));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "update record id",
    request: [
      "/zones/id/records/id",
      { method: "PUT", body: JSON.stringify(record) },
    ],
    response: record,
    successMessage: "DNS record saved",
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveDNSRecord("id", "id"),
        renderWithClient(client),
      );
      act(() => result.current.mutate(record));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "get records a/b?c",
    request: ["/zones/a%2Fb%3Fc/records"],
    response: [record],
    run: async (client) => {
      const { result } = renderHook(
        () => useDNSRecords({ ...resource, id: "a/b?c" }),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "certificates a/b?c",
    request: ["/zones/a%2Fb%3Fc/certificates"],
    response: [certificate],
    run: async (client) => {
      const { result } = renderHook(
        () => useZoneCertificates(resource),
        renderWithClient(client),
      );
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "delete record a/b?c",
    request: [
      "/zones/a%2Fb%3Fc/records/a%2Fb%3Fc",
      { method: "DELETE", body: "{}" },
    ],
    response: { ok: true },
    run: async (client) => {
      const { result } = renderHook(
        () => useRemoveDNSRecord("a/b?c"),
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
    name: "create record a/b?c",
    request: [
      "/zones/a%2Fb%3Fc/records",
      { method: "POST", body: JSON.stringify(record) },
    ],
    response: record,
    successMessage: "DNS record saved",
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveDNSRecord("a/b?c", undefined),
        renderWithClient(client),
      );
      act(() => result.current.mutate(record));
      await waitFor(() =>
        expect(result.current.isSuccess || result.current.isError).toBe(true),
      );
      return result.current.error;
    },
  },
  {
    name: "update record a/b?c",
    request: [
      "/zones/a%2Fb%3Fc/records/a%2Fb%3Fc",
      { method: "PUT", body: JSON.stringify(record) },
    ],
    response: record,
    successMessage: "DNS record saved",
    run: async (client) => {
      const { result } = renderHook(
        () => useSaveDNSRecord("a/b?c", "a/b?c"),
        renderWithClient(client),
      );
      act(() => result.current.mutate(record));
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

describe("dns surface request contracts", () => {
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
            body: JSON.stringify(posted[1]),
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
