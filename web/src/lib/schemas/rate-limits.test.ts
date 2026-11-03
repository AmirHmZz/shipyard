import { describe, expect, it } from "vitest";

import { rateLimitDrafts, rateLimitsSchema } from "./rate-limits";

const exact = { path: "/api", match: "exact", requests: 60, windowSeconds: 60 };

describe("route rate limits", () => {
  it("loads legacy routes and serializes rules without draft IDs", () => {
    expect(rateLimitDrafts(undefined)).toEqual([]);
    const drafts = rateLimitDrafts([
      exact,
      { ...exact, match: "subtree", requests: "30", windowSeconds: "15" },
    ]);
    expect(rateLimitsSchema.parse(drafts)).toEqual([
      exact,
      { ...exact, match: "subtree", requests: 30, windowSeconds: 15 },
    ]);
  });

  it("rejects invalid and duplicate rules", () => {
    for (const fields of [
      { path: "/api/", match: "subtree" },
      { path: "/api/../login" },
      { path: "/api//login" },
      { path: "/api?query=1" },
      { path: "/%61pi" },
      { requests: "0" },
      { requests: "1.5" },
      { windowSeconds: "3601" },
    ]) {
      expect(
        rateLimitsSchema.safeParse([{ ...exact, ...fields }]).success,
      ).toBe(false);
    }
    expect(rateLimitsSchema.safeParse([exact, exact]).success).toBe(false);
  });
});
