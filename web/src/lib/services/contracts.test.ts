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
const signal = new AbortController().signal;
const payload = {
  kind: "project" as const,
  name: "Project",
  data: {},
  parentId: "",
  teamId: "team",
  secrets: {},
  version: 3,
};

// Baseline: 70595bb:web/src/components/resource-forms/{controller,options}.tsx,
// variables.tsx, delete-resource.tsx, grants.tsx, and lib/api.ts.
describe("shared service request contracts", () => {
  const cases: Contract[] = [
    {
      name: "provider zones",
      run: () => services.getProviderZones("a/b?c"),
      request: ["/dns/a%2Fb%3Fc/zones"],
    },
    {
      name: "service options",
      run: () => services.getServiceOptions("a/b?c"),
      request: ["/applications/a%2Fb%3Fc/services"],
    },
    {
      name: "repositories and abort signal",
      run: () => services.getRepositories("a/b?c", signal),
      request: ["/git/a%2Fb%3Fc/repositories", { signal }],
    },
    {
      name: "branches and encoded repository",
      run: () => services.getBranches("a/b?c", "owner/repo?ref=main", signal),
      request: [
        "/git/a%2Fb%3Fc/branches?repository=owner%2Frepo%3Fref%3Dmain",
        { signal },
      ],
    },
    {
      name: "grants",
      run: () => services.getGrants("a/b?c"),
      request: ["/resources/a%2Fb%3Fc/grants"],
    },
    {
      name: "grant access",
      run: () => services.setGrant("a/b?c", "team", true),
      request: [
        "/resources/a%2Fb%3Fc/grants",
        {
          method: "POST",
          body: JSON.stringify({ teamId: "team", granted: true }),
        },
      ],
      posted: [
        "/resources/a%2Fb%3Fc/grants",
        { teamId: "team", granted: true },
      ],
    },
    {
      name: "revoke access",
      run: () => services.setGrant("a/b?c", "team", false),
      request: [
        "/resources/a%2Fb%3Fc/grants",
        {
          method: "POST",
          body: JSON.stringify({ teamId: "team", granted: false }),
        },
      ],
      posted: [
        "/resources/a%2Fb%3Fc/grants",
        { teamId: "team", granted: false },
      ],
    },
    {
      name: "test DNS",
      run: () =>
        services.testDNSCredentials({
          provider: "cloudflare",
          token: "secret",
        }),
      request: [
        "/dns/test",
        {
          method: "POST",
          body: JSON.stringify({ provider: "cloudflare", token: "secret" }),
        },
      ],
      posted: ["/dns/test", { provider: "cloudflare", token: "secret" }],
    },
    {
      name: "fingerprint default port",
      run: () =>
        services.probeServerFingerprint({ host: "server.test", port: 0 }),
      request: [
        "/servers/fingerprint",
        {
          method: "POST",
          body: JSON.stringify({ host: "server.test", port: 22 }),
        },
      ],
      posted: ["/servers/fingerprint", { host: "server.test", port: 22 }],
    },
    {
      name: "fingerprint explicit port",
      run: () =>
        services.probeServerFingerprint({ host: "server.test", port: 2222 }),
      request: [
        "/servers/fingerprint",
        {
          method: "POST",
          body: JSON.stringify({ host: "server.test", port: 2222 }),
        },
      ],
      posted: ["/servers/fingerprint", { host: "server.test", port: 2222 }],
    },
    {
      name: "new resource",
      run: () => services.saveResource(undefined, "project", payload),
      request: [
        "/resources",
        { method: "POST", body: JSON.stringify(payload) },
      ],
    },
    {
      name: "update resource",
      run: () => services.saveResource("a/b?c", "project", payload),
      request: [
        "/resources/a%2Fb%3Fc",
        { method: "PUT", body: JSON.stringify(payload) },
      ],
    },
    {
      name: "route omits name",
      run: () => services.saveResource("a/b?c", "route", payload),
      request: [
        "/resources/a%2Fb%3Fc",
        {
          method: "PUT",
          body: '{"kind":"project","data":{},"parentId":"","teamId":"team","secrets":{},"version":3}',
        },
      ],
    },
    {
      name: "delete resource",
      run: () => services.deleteResource("a/b?c"),
      request: ["/resources/a%2Fb%3Fc", { method: "DELETE", body: "{}" }],
    },
    {
      name: "ordinary variable",
      run: () =>
        services.saveVariable(resource, {
          name: "env:NAME",
          value: "value",
          encrypted: false,
        }),
      request: [
        "/resources/a%2Fb%3Fc",
        {
          method: "PUT",
          body: '{"kind":"application","name":"App","data":{"source":"git"},"version":3,"variables":{"env:NAME":"value"}}',
        },
      ],
    },
    {
      name: "remove ordinary variable",
      run: () =>
        services.saveVariable(resource, {
          name: "env:NAME",
          value: null,
          encrypted: false,
        }),
      request: [
        "/resources/a%2Fb%3Fc",
        {
          method: "PUT",
          body: '{"kind":"application","name":"App","data":{"source":"git"},"version":3,"variables":{"env:NAME":null}}',
        },
      ],
    },
    {
      name: "secret variable",
      run: () =>
        services.saveVariable(resource, {
          name: "build:TOKEN",
          value: "secret",
          encrypted: true,
        }),
      request: [
        "/resources/a%2Fb%3Fc",
        {
          method: "PUT",
          body: '{"kind":"application","name":"App","data":{"source":"git"},"version":3,"secrets":{"build:TOKEN":"secret"}}',
        },
      ],
    },
    {
      name: "remove secret variable",
      run: () =>
        services.saveVariable(resource, {
          name: "build:TOKEN",
          value: null,
          encrypted: true,
        }),
      request: [
        "/resources/a%2Fb%3Fc",
        {
          method: "PUT",
          body: '{"kind":"application","name":"App","data":{"source":"git"},"version":3,"secrets":{"build:TOKEN":""}}',
        },
      ],
    },
    {
      name: "all deployments",
      run: () => services.getDeployments(),
      request: ["/deployments"],
    },
    {
      name: "filtered deployments",
      run: () => services.getDeployments("app"),
      request: ["/deployments?applicationId=app"],
    },
    {
      name: "encoded deployment filter",
      run: () => services.getDeployments("a/b?c"),
      request: ["/deployments?applicationId=a%2Fb%3Fc"],
    },
    {
      name: "empty deployment filter",
      run: () => services.getDeployments(""),
      request: ["/deployments"],
    },
  ];
  it.each(cases)("$name", async ({ run, request, posted }) => {
    await run();
    expect(api).toHaveBeenCalledExactlyOnceWith(...request);
    if (posted) expect(post).toHaveBeenCalledExactlyOnceWith(...posted);
    else expect(post).not.toHaveBeenCalled();
  });
});
