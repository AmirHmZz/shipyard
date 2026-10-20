import { beforeEach, describe, expect, it, vi } from "vitest";

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
const connection = {
  host: "server.test",
  port: 22,
  user: "root",
  fingerprint: "SHA256:example",
  authMethod: "password",
  secrets: { password: "secret" },
};

// Baseline: git show 70595bb:web/src/routes/server-deletion/modules/components/*.tsx.
describe("server-deletion service request contracts", () => {
  const cases: Contract[] = [
    {
      name: "status",
      run: () => services.getServerDeletionStatus("a/b?c"),
      request: ["/servers/a%2Fb%3Fc/deletion"],
    },
    {
      name: "repair connection",
      run: () => services.repairServerConnection("a/b?c", connection),
      request: [
        "/servers/a%2Fb%3Fc/deletion/connection",
        { method: "PUT", body: JSON.stringify(connection) },
      ],
    },
    {
      name: "confirm deletion",
      run: () =>
        services.confirmServerDeletion("a/b?c", {
          planId: "plan",
          name: "Server",
          deleteVolumes: true,
        }),
      request: [
        "/servers/a%2Fb%3Fc",
        {
          method: "DELETE",
          body: '{"planId":"plan","name":"Server","deleteVolumes":true}',
        },
      ],
    },
    {
      name: "retry deletion",
      run: () => services.retryServerDeletion("a/b?c"),
      request: [
        "/servers/a%2Fb%3Fc/deletion/retry",
        { method: "POST", body: "{}" },
      ],
      posted: ["/servers/a%2Fb%3Fc/deletion/retry"],
    },
    {
      name: "review deletion",
      run: () => services.reviewServerDeletion("a/b?c"),
      request: [
        "/servers/a%2Fb%3Fc/deletion-plan",
        { method: "POST", body: "{}" },
      ],
      posted: ["/servers/a%2Fb%3Fc/deletion-plan"],
    },
  ];
  it.each(cases)("$name", async ({ run, request, posted }) => {
    await run();
    expect(api).toHaveBeenCalledExactlyOnceWith(...request);
    if (posted) expect(post).toHaveBeenCalledExactlyOnceWith(...posted);
    else expect(post).not.toHaveBeenCalled();
  });
});
