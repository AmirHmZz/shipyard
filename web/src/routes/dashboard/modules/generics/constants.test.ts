import { describe, expect, it } from "vitest";
import { dashboardKeys } from "./constants";

describe("dashboard query keys", () => {
  it("preserves the setup key", () => {
    expect(dashboardKeys.setup).toEqual(["setup"]);
  });
});
