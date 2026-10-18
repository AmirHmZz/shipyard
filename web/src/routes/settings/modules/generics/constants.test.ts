import { describe, expect, it } from "vitest";
import { settingsKeys } from "./constants";

describe("settings query keys", () => {
  it("preserves each original shape", () => {
    expect(settingsKeys.users).toEqual(["users"]);
    expect(settingsKeys.systemUpdates).toEqual(["system-updates"]);
    expect(settingsKeys.history("audit")).toEqual(["audit"]);
    expect(settingsKeys.dashboardAccess).toEqual(["dashboard-access"]);
    expect(settingsKeys.alertPolicy).toEqual(["alert-policy"]);
  });
});
