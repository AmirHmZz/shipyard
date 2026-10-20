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
const network = {
  name: "net",
  dockerId: "docker",
  subnet: "10.0.0.0/24",
  dynamicRange: "",
  enableIPv6: false,
  ipv6Subnet: "",
};
const instance = {
  id: "instance",
  name: "Gitea",
  url: "https://git.test",
  clientId: "client",
  clientSecret: "secret",
};

// Baseline: git show 70595bb:web/src/routes/configuration/modules/components/*.tsx.
describe("configuration service request contracts", () => {
  const cases: Contract[] = [
    {
      name: "createGitWebhook id",
      run: () => services.createGitWebhook("id"),
      request: ["/git/id/webhook-secret", { method: "POST", body: "{}" }],
      posted: ["/git/id/webhook-secret"],
    },
    {
      name: "reconnectGit id",
      run: () => services.reconnectGit("id"),
      request: ["/git/id/reconnect", { method: "POST", body: "{}" }],
      posted: ["/git/id/reconnect"],
    },
    {
      name: "git setup id",
      run: () => services.getGitSetupStatus({ ...resource, id: "id" }),
      request: ["/git/id/setup"],
    },
    {
      name: "HAProxy settings id",
      run: () => services.getHAProxySettings({ ...resource, id: "id" }),
      request: ["/servers/id/haproxy"],
    },
    {
      name: "network inventory id",
      run: () => services.getNetworkInventory("id"),
      request: ["/servers/id/networks"],
    },
    {
      name: "create network id",
      run: () => services.createNetwork("id", network),
      request: [
        "/servers/id/networks",
        { method: "POST", body: JSON.stringify(network) },
      ],
    },
    {
      name: "save HAProxy id",
      run: () =>
        services.saveHAProxySettings("id", {
          version: 3,
          bindings: { http: ["0.0.0.0:80"] },
        }),
      request: [
        "/servers/id/haproxy",
        {
          method: "PUT",
          body: '{"version":3,"bindings":{"http":["0.0.0.0:80"]}}',
        },
      ],
    },
    {
      name: "createGitWebhook a/b?c",
      run: () => services.createGitWebhook("a/b?c"),
      request: [
        "/git/a%2Fb%3Fc/webhook-secret",
        { method: "POST", body: "{}" },
      ],
      posted: ["/git/a%2Fb%3Fc/webhook-secret"],
    },
    {
      name: "reconnectGit a/b?c",
      run: () => services.reconnectGit("a/b?c"),
      request: ["/git/a%2Fb%3Fc/reconnect", { method: "POST", body: "{}" }],
      posted: ["/git/a%2Fb%3Fc/reconnect"],
    },
    {
      name: "git setup a/b?c",
      run: () => services.getGitSetupStatus({ ...resource, id: "a/b?c" }),
      request: ["/git/a%2Fb%3Fc/setup"],
    },
    {
      name: "HAProxy settings a/b?c",
      run: () => services.getHAProxySettings({ ...resource, id: "a/b?c" }),
      request: ["/servers/a%2Fb%3Fc/haproxy"],
    },
    {
      name: "network inventory a/b?c",
      run: () => services.getNetworkInventory("a/b?c"),
      request: ["/servers/a%2Fb%3Fc/networks"],
    },
    {
      name: "create network a/b?c",
      run: () => services.createNetwork("a/b?c", network),
      request: [
        "/servers/a%2Fb%3Fc/networks",
        { method: "POST", body: JSON.stringify(network) },
      ],
    },
    {
      name: "save HAProxy a/b?c",
      run: () =>
        services.saveHAProxySettings("a/b?c", {
          version: 3,
          bindings: { http: ["0.0.0.0:80"] },
        }),
      request: [
        "/servers/a%2Fb%3Fc/haproxy",
        {
          method: "PUT",
          body: '{"version":3,"bindings":{"http":["0.0.0.0:80"]}}',
        },
      ],
    },
    {
      name: "save Gitea instance",
      run: () => services.saveGiteaInstance(instance),
      request: [
        "/git/gitea/instances",
        { method: "PUT", body: JSON.stringify(instance) },
      ],
    },
    {
      name: "start Git setup",
      run: () =>
        services.startGitSetup({
          provider: "github",
          name: "Git",
          owner: "org",
          instanceId: "",
        }),
      request: [
        "/git/setup/start",
        {
          method: "POST",
          body: JSON.stringify({
            provider: "github",
            name: "Git",
            owner: "org",
            instanceId: "",
          }),
        },
      ],
      posted: [
        "/git/setup/start",
        { provider: "github", name: "Git", owner: "org", instanceId: "" },
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
