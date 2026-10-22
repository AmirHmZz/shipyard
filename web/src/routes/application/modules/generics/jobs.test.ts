import { describe, expect, it } from "vitest";

import {
  jobPolicyFormSchema,
  jobSettingsSchema,
  activeJobRun,
  jobRunSchema,
} from "./jobs";

const settings = {
  version: 0,
  enabled: false,
  cron: "",
  timezone: "Asia/Tehran",
  timeoutSeconds: 1800,
  retries: 0,
  retryDelaySeconds: 60,
  nextDue: null,
  upcoming: [],
};
describe("Job policy and execution contracts", function suite() {
  it("coerces form numbers and enforces execution bounds", function bounds() {
    expect(
      jobPolicyFormSchema.parse({
        ...settings,
        timeoutSeconds: "60",
        retries: "5",
        retryDelaySeconds: "3600",
      }),
    ).toMatchObject({
      timeoutSeconds: 60,
      retries: 5,
      retryDelaySeconds: 3600,
    });
    for (const change of [
      { timeoutSeconds: 59 },
      { timeoutSeconds: 86401 },
      { retries: 6 },
      { retries: -1 },
      { retryDelaySeconds: 0 },
    ])
      expect(
        jobPolicyFormSchema.safeParse({ ...settings, ...change }).success,
      ).toBe(false);
    expect(
      jobSettingsSchema.safeParse({ ...settings, version: "1" }).success,
    ).toBe(false);
  });
  it("keeps retry waits and cancellation in the single-run slot", function lifecycle() {
    const base = {
      id: "run",
      applicationId: "app",
      releaseId: "release",
      trigger: "manual",
      actor: "operator",
      policy: settings,
      createdAt: "2026-10-23T00:00:00Z",
      finishedAt: null,
      retryAt: null,
      error: "",
      cleanupPending: true,
      attempts: [],
    };
    for (const state of ["queued", "running", "retry_wait", "cancelling"])
      expect(activeJobRun(jobRunSchema.parse({ ...base, state }))).toBe(true);
    for (const state of [
      "succeeded",
      "failed",
      "timed_out",
      "cancelled",
      "skipped",
    ])
      expect(activeJobRun(jobRunSchema.parse({ ...base, state }))).toBe(false);
  });
});
