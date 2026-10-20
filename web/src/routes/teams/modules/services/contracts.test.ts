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

// Baseline: git show 70595bb:web/src/routes/teams/modules/components/*.tsx.
describe("teams service request contracts", () => {
  const cases: Contract[] = [
    {
      name: "members",
      run: () => services.getTeamMembers(resource),
      request: ["/teams/a%2Fb%3Fc/members"],
    },
    {
      name: "remove member",
      run: () => services.removeTeamMember("a/b?c", "a/b?c"),
      request: [
        "/teams/a%2Fb%3Fc/members/a%2Fb%3Fc",
        { method: "DELETE", body: "{}" },
      ],
    },
    {
      name: "assign member",
      run: () =>
        services.assignTeamMember("a/b?c", {
          userId: "user",
          role: "operator",
        }),
      request: [
        "/projects/a%2Fb%3Fc/members",
        {
          method: "POST",
          body: JSON.stringify({ userId: "user", role: "operator" }),
        },
      ],
      posted: [
        "/projects/a%2Fb%3Fc/members",
        { userId: "user", role: "operator" },
      ],
    },
    {
      name: "invitation",
      run: () =>
        services.createInvitation("a/b?c", {
          email: "u@example.test",
          role: "member",
          projectId: "",
        }),
      request: [
        "/teams/a%2Fb%3Fc/invitations",
        {
          method: "POST",
          body: JSON.stringify({
            email: "u@example.test",
            role: "member",
            projectId: "",
          }),
        },
      ],
      posted: [
        "/teams/a%2Fb%3Fc/invitations",
        { email: "u@example.test", role: "member", projectId: "" },
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
