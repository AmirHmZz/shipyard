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

// Baseline: git show 70595bb:web/src/routes/networks/modules/components/*.tsx.
describe("networks service request contracts", () => {
  const cases: Contract[] = [
    {
      name: "inventory special id",
      run: () => services.getDockerNetworks("a/b?c"),
      request: ["/servers/a%2Fb%3Fc/networks"],
    },
    {
      name: "remove network",
      run: () => services.removeNetwork("a/b?c"),
      request: ["/resources/a%2Fb%3Fc", { method: "DELETE", body: "{}" }],
    },
  ];
  it.each(cases)("$name", async ({ run, request, posted }) => {
    await run();
    expect(api).toHaveBeenCalledExactlyOnceWith(...request);
    if (posted) expect(post).toHaveBeenCalledExactlyOnceWith(...posted);
    else expect(post).not.toHaveBeenCalled();
  });
});
