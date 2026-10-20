import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Resource } from "@/lib/api/types";

import { api, post } from "@/lib/api/client";

import * as services from "./index";

vi.mock("@/lib/api/client", () => {
  const api = vi.fn();
  return {
    api,
    post: vi.fn((path: string, body: unknown = {}) =>
      api(path, { method: "POST", body: JSON.stringify(body) }),
    ),
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api).mockResolvedValue({ ok: true });
});
type Contract = {
  name: string;
  run: () => Promise<unknown>;
  request: unknown[];
  posted?: unknown[];
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

// Baseline: git show 70595bb:web/src/routes/dns/modules/components/*.tsx.
describe("dns service request contracts", () => {
  const cases: Contract[] = [
    {
      name: "get records id",
      run: () => services.getDNSRecords({ ...resource, id: "id" }),
      request: ["/zones/id/records"],
    },
    {
      name: "certificates id",
      run: () => services.getZoneCertificates({ ...resource, id: "id" }),
      request: ["/zones/id/certificates"],
    },
    {
      name: "delete record id",
      run: () => services.removeDNSRecord("id", "id"),
      request: ["/zones/id/records/id", { method: "DELETE", body: "{}" }],
    },
    {
      name: "create record id",
      run: () => services.saveDNSRecord("id", {}, record),
      request: [
        "/zones/id/records",
        { method: "POST", body: JSON.stringify(record) },
      ],
    },
    {
      name: "update record id",
      run: () => services.saveDNSRecord("id", { id: "id" }, record),
      request: [
        "/zones/id/records/id",
        { method: "PUT", body: JSON.stringify(record) },
      ],
    },
    {
      name: "get records a/b?c",
      run: () => services.getDNSRecords({ ...resource, id: "a/b?c" }),
      request: ["/zones/a%2Fb%3Fc/records"],
    },
    {
      name: "certificates a/b?c",
      run: () => services.getZoneCertificates(resource),
      request: ["/zones/a%2Fb%3Fc/certificates"],
    },
    {
      name: "delete record a/b?c",
      run: () => services.removeDNSRecord("a/b?c", "a/b?c"),
      request: [
        "/zones/a%2Fb%3Fc/records/a%2Fb%3Fc",
        { method: "DELETE", body: "{}" },
      ],
    },
    {
      name: "create record a/b?c",
      run: () => services.saveDNSRecord("a/b?c", {}, record),
      request: [
        "/zones/a%2Fb%3Fc/records",
        { method: "POST", body: JSON.stringify(record) },
      ],
    },
    {
      name: "update record a/b?c",
      run: () => services.saveDNSRecord("a/b?c", { id: "a/b?c" }, record),
      request: [
        "/zones/a%2Fb%3Fc/records/a%2Fb%3Fc",
        { method: "PUT", body: JSON.stringify(record) },
      ],
    },
  ];
  it.each(cases)("$name", async ({ run, request, posted }) => {
    await run();
    expect(api).toHaveBeenCalledExactlyOnceWith(...request);
    if (posted) expect(post).toHaveBeenCalledExactlyOnceWith(...posted);
    else expect(post).not.toHaveBeenCalled();
  });
});
