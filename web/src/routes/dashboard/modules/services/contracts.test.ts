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
    setCSRF: vi.fn(),
    APIError: class extends Error {
      constructor(
        public status: number,
        message: string,
      ) {
        super(message);
      }
    },
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
const auth = {
  name: "User",
  email: "u@example.test",
  password: "password",
  code: "123456",
  token: "invite",
};

// Baseline: git show 70595bb:web/src/routes/dashboard/modules/components/*.tsx.
describe("dashboard service request contracts", () => {
  const cases: Contract[] = [
    {
      name: "logout",
      run: () => services.logout(),
      request: ["/auth/logout", { method: "POST", body: "{}" }],
      posted: ["/auth/logout"],
    },
    {
      name: "auth login",
      run: () => services.submitAuth("login", auth),
      request: ["/auth/login", { method: "POST", body: JSON.stringify(auth) }],
      posted: ["/auth/login", auth],
    },
    {
      name: "auth accept",
      run: () => services.submitAuth("accept", auth),
      request: ["/auth/accept", { method: "POST", body: JSON.stringify(auth) }],
      posted: ["/auth/accept", auth],
    },
    {
      name: "auth setup",
      run: () => services.submitAuth("setup", auth),
      request: ["/auth/setup", { method: "POST", body: JSON.stringify(auth) }],
      posted: ["/auth/setup", auth],
    },
  ];
  it.each(cases)("$name", async ({ run, request, posted }) => {
    await run();
    expect(api).toHaveBeenCalledExactlyOnceWith(...request);
    if (posted) expect(post).toHaveBeenCalledExactlyOnceWith(...posted);
    else expect(post).not.toHaveBeenCalled();
  });
});

describe("session transport", () => {
  it("sets CSRF after the existing session request", async () => {
    const { setCSRF } = await import("@/lib/api/client");
    const session = { csrf: "token", user: { id: "user" } };
    vi.mocked(api).mockResolvedValue(session);
    expect(await services.getSession()).toBe(session);
    expect(api).toHaveBeenCalledExactlyOnceWith("/auth/me");
    expect(setCSRF).toHaveBeenCalledExactlyOnceWith("token");
  });
  it("clears CSRF only for unauthorized sessions and propagates other failures", async () => {
    const { APIError, setCSRF } = await import("@/lib/api/client");
    vi.mocked(api).mockRejectedValueOnce(new APIError(401, "signed out"));
    expect(await services.getSession()).toBeNull();
    expect(setCSRF).toHaveBeenCalledExactlyOnceWith("");
    const failure = new APIError(503, "offline");
    vi.mocked(api).mockRejectedValueOnce(failure);
    await expect(services.getSession()).rejects.toBe(failure);
    expect(setCSRF).toHaveBeenCalledTimes(1);
  });
});
