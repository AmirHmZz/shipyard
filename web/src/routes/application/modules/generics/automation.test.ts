import { describe, it, expect } from "vitest";

import {
  automationSettingsSchema,
  resourceLimitsInputSchema,
  canDeleteJobRun,
} from "./automation";

describe("service automation and limits", function () {
  it("validates Docker limits and restart intervals", function () {
    expect(
      resourceLimitsInputSchema.safeParse({
        version: 1,
        services: { app: { cpus: 0.5, memoryBytes: 268435456 } },
      }).success,
    ).toBe(true);
    for (const cpus of [0, -1, Infinity, NaN])
      expect(
        resourceLimitsInputSchema.safeParse({
          version: 1,
          services: { app: { cpus } },
        }).success,
      ).toBe(false);
    expect(
      resourceLimitsInputSchema.safeParse({
        version: 1,
        services: { app: { memoryBytes: 1024 } },
      }).success,
    ).toBe(false);
    expect(
      automationSettingsSchema.safeParse({
        version: 0,
        restarts: [{ service: "app", enabled: true, intervalSeconds: 59 }],
        rules: [],
      }).success,
    ).toBe(false);
  });
  it("protects active and uncleaned run history", function () {
    const run = {
      state: "succeeded",
      cleanupPending: false,
      attempts: [{ cleaned: true, logsComplete: true }],
    };
    expect(canDeleteJobRun(run)).toBe(true);
    expect(canDeleteJobRun({ ...run, state: "running" })).toBe(false);
    expect(canDeleteJobRun({ ...run, cleanupPending: true })).toBe(false);
    expect(
      canDeleteJobRun({
        ...run,
        attempts: [{ cleaned: false, logsComplete: true }],
      }),
    ).toBe(false);
  });
});
