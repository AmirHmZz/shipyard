import { describe, expect, it } from "vitest";
import { applicationKeys } from "./constants";

describe("application query keys", () => {
  it("preserves each original shape", () => {
    expect(applicationKeys.deployment(null)).toEqual(["deployment", null]);
    expect(applicationKeys.domain("route")).toEqual(["domain", "route"]);
    expect(applicationKeys.composeSource("app", 3)).toEqual([
      "compose-source",
      "app",
      3,
    ]);
    expect(applicationKeys.runtime("app")).toEqual(["runtime", "app"]);
    expect(applicationKeys.releases("app")).toEqual(["releases", "app"]);
    expect(applicationKeys.networking("app", 3)).toEqual([
      "networking",
      "app",
      3,
    ]);
    expect(applicationKeys.networkingPrefix("app")).toEqual([
      "networking",
      "app",
    ]);
    expect(applicationKeys.metrics("app")).toEqual([
      "application-metrics",
      "app",
    ]);
  });
});
