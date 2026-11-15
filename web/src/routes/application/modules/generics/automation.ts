import * as z from "zod/mini";

export const restartPolicySchema = z.object({
  service: z.string().check(z.regex(/^[a-zA-Z0-9_.-]+$/)),
  enabled: z.boolean(),
  intervalSeconds: z.coerce.number().check(z.int(), z.gte(60), z.lte(31536000)),
});
export const automationRuleSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  action: z.enum(["start", "stop"]),
  cron: z.string().check(z.minLength(1)),
  timezone: z.string().check(z.minLength(1)),
});
export const automationSettingsSchema = z.object({
  version: z.number(),
  restarts: z.array(restartPolicySchema),
  rules: z.array(automationRuleSchema),
});
export const automationStatusSchema = z.extend(automationSettingsSchema, {
  lastAction: z.string(),
  lastAt: z.nullable(z.string()),
  lastResult: z.string(),
  lastError: z.string(),
  upcoming: z.record(z.string(), z.array(z.string())),
  restartStatus: z.array(
    z.object({
      service: z.string(),
      container: z.string(),
      nextDue: z.nullable(z.string()),
      state: z.string(),
    }),
  ),
});
export const schedulePreviewSchema = z.object({
  upcoming: z.array(z.string()),
});
export const serviceLimitsSchema = z.object({
  cpus: z.optional(z.number().check(z.gte(0.001), z.lte(1000000))),
  memoryBytes: z.optional(
    z.number().check(z.int(), z.gte(6291456), z.lte(Number.MAX_SAFE_INTEGER)),
  ),
});
export const resourceLimitsInputSchema = z.object({
  version: z.number(),
  services: z.record(z.string(), serviceLimitsSchema),
});
export const resourceLimitsSchema = z.extend(resourceLimitsInputSchema, {
  applied: z.record(z.string(), serviceLimitsSchema),
  pending: z.boolean(),
});
export const restartDraftSchema = z.object({
  amount: z.coerce.number().check(z.gt(0)),
  unit: z.enum(["minutes", "hours", "days"]),
});
export const resourceLimitDraftSchema = z.object({
  cpu: z.string(),
  memory: z.string(),
  unit: z.enum(["MiB", "GiB"]),
});
export const automationKeys = {
  all: (id: string) => ["application-automation", id],
  settings: (id: string) => ["application-automation", id, "settings"],
  preview: (id: string, cron: string, timezone: string) => [
    "application-automation",
    id,
    "preview",
    cron,
    timezone,
  ],
};
export const resourceLimitKeys = {
  all: (id: string) => ["application-resource-limits", id],
};
export type AutomationSettings = z.infer<typeof automationSettingsSchema>;
export type AutomationStatus = z.infer<typeof automationStatusSchema>;
export type AutomationRule = z.infer<typeof automationRuleSchema>;
export type ResourceLimits = z.infer<typeof resourceLimitsSchema>;
export type ResourceLimitsInput = z.infer<typeof resourceLimitsInputSchema>;

export function canDeleteJobRun(run: {
  state: string;
  cleanupPending: boolean;
  attempts: { cleaned: boolean; logsComplete: boolean }[];
}) {
  return (
    ["succeeded", "failed", "timed_out", "cancelled", "skipped"].includes(
      run.state,
    ) &&
    !run.cleanupPending &&
    run.attempts.every((attempt) => attempt.cleaned && attempt.logsComplete)
  );
}
