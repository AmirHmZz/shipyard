import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, post } from "@/lib/api/client";
import type { Resource } from "@/lib/api/types";
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

// Baseline: git show 70595bb:web/src/routes/servers/modules/components/*.tsx.
describe("servers service request contracts", () => {
  const cases: Contract[] = [
    {
      name: "metrics",
      run: () => services.getServerMetrics(resource),
      request: ["/servers/a%2Fb%3Fc/metrics"],
    },
    {
      name: "Docker version",
      run: () => services.checkDockerVersion("a/b?c"),
      request: ["/servers/a%2Fb%3Fc/test", { method: "POST", body: "{}" }],
      posted: ["/servers/a%2Fb%3Fc/test"],
    },
    {
      name: "provision",
      run: () => services.provisionServer("a/b?c"),
      request: ["/servers/a%2Fb%3Fc/provision", { method: "POST", body: "{}" }],
      posted: ["/servers/a%2Fb%3Fc/provision"],
    },
  ];
  it.each(cases)("$name", async ({ run, request, posted }) => {
    await run();
    expect(api).toHaveBeenCalledExactlyOnceWith(...request);
    if (posted) expect(post).toHaveBeenCalledExactlyOnceWith(...posted);
    else expect(post).not.toHaveBeenCalled();
  });
});
