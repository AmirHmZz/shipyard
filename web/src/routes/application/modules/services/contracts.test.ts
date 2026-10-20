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

// Baseline: git show 70595bb:web/src/routes/application/modules/components/*.tsx.
describe.each([
  ["id", "id"],
  ["a/b?c", "a%2Fb%3Fc"],
])("application service request contracts (%s)", (id, encoded) => {
  const cases: Contract[] = [
    {
      name: `getApplicationRuntime ${id}`,
      run: () => services.getApplicationRuntime(id),
      request: [`/applications/${encoded}/runtime`],
    },
    {
      name: `getApplicationMetrics ${id}`,
      run: () => services.getApplicationMetrics(id),
      request: [`/applications/${encoded}/metrics`],
    },
    {
      name: `getApplicationReleases ${id}`,
      run: () => services.getApplicationReleases(id),
      request: [`/applications/${encoded}/releases`],
    },
    {
      name: `getApplicationNetworking ${id}`,
      run: () => services.getApplicationNetworking({ ...resource, id: id }),
      request: [`/applications/${encoded}/networking`],
    },
    {
      name: `getApplicationServices ${id}`,
      run: () => services.getApplicationServices({ ...resource, id: id }),
      request: [`/applications/${encoded}/services`],
    },
    {
      name: `getComposeSource ${id}`,
      run: () => services.getComposeSource({ ...resource, id: id }),
      request: [`/applications/${encoded}/compose`],
    },
    {
      name: `selected deployment ${id}`,
      run: () => services.getSelectedDeployment(id),
      request: [`/deployments/${encoded}`],
    },
    {
      name: `domain status ${id}`,
      run: () => services.getDomainStatus({ ...resource, id: id }),
      request: [`/routes/${encoded}/status`],
    },
    {
      name: `delete resource ${id}`,
      run: () => services.deleteActionResource("delete:" + id),
      request: [`/resources/${encoded}`, { method: "DELETE", body: "{}" }],
    },
    {
      name: `remove deployment ${id}`,
      run: () => services.removeDeployment(id),
      request: [`/deployments/${encoded}`, { method: "DELETE" }],
    },
    {
      name: `createDeployment {} ${id}`,
      run: () => services.createDeployment(id, {}),
      request: [
        `/applications/${encoded}/deploy`,
        { method: "POST", body: JSON.stringify({}) },
      ],
      posted: [`/applications/${encoded}/deploy`, {}],
    },
    {
      name: 'createDeployment { fresh: true, confirmName: "App", version: 3 } id',
      run: () =>
        services.createDeployment(id, {
          fresh: true,
          confirmName: "App",
          version: 3,
        }),
      request: [
        `/applications/${encoded}/deploy`,
        {
          method: "POST",
          body: JSON.stringify({ fresh: true, confirmName: "App", version: 3 }),
        },
      ],
      posted: [
        `/applications/${encoded}/deploy`,
        { fresh: true, confirmName: "App", version: 3 },
      ],
    },
    {
      name: `deployComposeSource { version: 3 } ${id}`,
      run: () => services.deployComposeSource(id, { version: 3 }),
      request: [
        `/applications/${encoded}/deploy`,
        { method: "POST", body: JSON.stringify({ version: 3 }) },
      ],
      posted: [`/applications/${encoded}/deploy`, { version: 3 }],
    },
    {
      name: 'rollbackApplication { releaseId: "release" } id',
      run: () => services.rollbackApplication(id, { releaseId: "release" }),
      request: [
        `/applications/${encoded}/rollback`,
        { method: "POST", body: JSON.stringify({ releaseId: "release" }) },
      ],
      posted: [`/applications/${encoded}/rollback`, { releaseId: "release" }],
    },
    {
      name: 'runApplicationAction { action: "restart" } id',
      run: () => services.runApplicationAction(id, { action: "restart" }),
      request: [
        `/applications/${encoded}/action`,
        { method: "POST", body: JSON.stringify({ action: "restart" }) },
      ],
      posted: [`/applications/${encoded}/action`, { action: "restart" }],
    },
    {
      name: 'updateApplicationVersion { sha: "a".repeat(40) } id',
      run: () => services.updateApplicationVersion(id, { sha: "a".repeat(40) }),
      request: [
        `/applications/${encoded}/approve-preview`,
        { method: "POST", body: JSON.stringify({ sha: "a".repeat(40) }) },
      ],
      posted: [
        `/applications/${encoded}/approve-preview`,
        { sha: "a".repeat(40) },
      ],
    },
    {
      name: 'createApplicationPreview { sha: "b".repeat(40) } id',
      run: () => services.createApplicationPreview(id, { sha: "b".repeat(40) }),
      request: [
        `/applications/${encoded}/approve-preview`,
        { method: "POST", body: JSON.stringify({ sha: "b".repeat(40) }) },
      ],
      posted: [
        `/applications/${encoded}/approve-preview`,
        { sha: "b".repeat(40) },
      ],
    },
    {
      name: `save published-ports ${id}`,
      run: () =>
        services.saveApplicationNetworking(id, true, {
          version: 3,
          services: {},
        }),
      request: [
        `/applications/${encoded}/published-ports`,
        { method: "PUT", body: '{"version":3,"services":{}}' },
      ],
    },
    {
      name: `save networking ${id}`,
      run: () =>
        services.saveApplicationNetworking(id, false, {
          version: 3,
          services: {},
        }),
      request: [
        `/applications/${encoded}/networking`,
        { method: "PUT", body: '{"version":3,"services":{}}' },
      ],
    },
    {
      name: `save preview ${id}`,
      run: () =>
        services.saveApplicationPreview(id, {
          kind: "application",
          name: "App",
          version: 3,
          data: { previews: true },
        }),
      request: [
        `/resources/${encoded}`,
        {
          method: "PUT",
          body: '{"kind":"application","name":"App","version":3,"data":{"previews":true}}',
        },
      ],
    },
    {
      name: `save Compose ${id}`,
      run: () =>
        services.saveComposeSource(id, { yaml: "services: {}", version: 3 }),
      request: [
        `/applications/${encoded}/compose`,
        { method: "PUT", body: '{"yaml":"services: {}","version":3}' },
      ],
    },
    {
      name: `sync route ${id}`,
      run: () => services.syncRoute(id, { mode: "sync" }),
      request: [
        `/routes/${encoded}/sync`,
        { method: "POST", body: JSON.stringify({ mode: "sync" }) },
      ],
      posted: [`/routes/${encoded}/sync`, { mode: "sync" }],
    },
  ];
  it.each(cases)("$name", async ({ run, request, posted }) => {
    await run();
    expect(api).toHaveBeenCalledExactlyOnceWith(...request);
    if (posted) expect(post).toHaveBeenCalledExactlyOnceWith(...posted);
    else expect(post).not.toHaveBeenCalled();
  });
});
