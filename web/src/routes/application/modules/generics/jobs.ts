import * as z from "zod/mini";

export const jobSettingsSchema = z.object({
  version: z.number(),
  enabled: z.boolean(),
  cron: z.string(),
  timezone: z.string(),
  timeoutSeconds: z.number(),
  retries: z.number(),
  retryDelaySeconds: z.number(),
  nextDue: z.nullable(z.string()),
  upcoming: z.array(z.string()),
});
export const jobPolicyFormSchema = z.object({
  enabled: z.boolean(),
  cron: z.string(),
  timezone: z.string().check(z.minLength(1)),
  timeoutSeconds: z.coerce.number().check(z.int(), z.gte(60), z.lte(86400)),
  retries: z.coerce.number().check(z.int(), z.gte(0), z.lte(5)),
  retryDelaySeconds: z.coerce.number().check(z.int(), z.gte(1), z.lte(3600)),
});
export const jobAttemptSchema = z.object({
  number: z.number(),
  container: z.string(),
  state: z.string(),
  startedAt: z.nullable(z.string()),
  deadline: z.nullable(z.string()),
  finishedAt: z.nullable(z.string()),
  exitCode: z.nullable(z.number()),
  logBytes: z.number(),
  logLines: z.number(),
  logsComplete: z.boolean(),
  cleaned: z.boolean(),
});
export const jobRunSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  releaseId: z.string(),
  state: z.enum([
    "queued",
    "running",
    "retry_wait",
    "cancelling",
    "succeeded",
    "failed",
    "timed_out",
    "cancelled",
    "skipped",
  ]),
  trigger: z.string(),
  actor: z.string(),
  policy: jobSettingsSchema,
  createdAt: z.string(),
  finishedAt: z.nullable(z.string()),
  retryAt: z.nullable(z.string()),
  error: z.string(),
  cleanupPending: z.boolean(),
  attempts: z.array(jobAttemptSchema),
});
export const jobRunsSchema = z.object({
  items: z.array(jobRunSchema),
  nextCursor: z.string(),
  activeRun: z.nullable(jobRunSchema),
});
export type JobRun = z.infer<typeof jobRunSchema>;
export type JobSettings = z.infer<typeof jobSettingsSchema>;
export type JobPolicyForm = z.infer<typeof jobPolicyFormSchema>;
export function activeJobRun(run: JobRun) {
  return ["queued", "running", "retry_wait", "cancelling"].includes(run.state);
}
export const jobKeys = {
  all: (id: string) => ["application-jobs", id],
  settings: (id: string) => ["application-jobs", id, "settings"],
  runs: (id: string, cursor = "") => ["application-jobs", id, "runs", cursor],
  run: (id: string, run: string) => ["application-jobs", id, "run", run],
  preview: (id: string, cron: string, timezone: string) => [
    "application-jobs",
    id,
    "preview",
    cron,
    timezone,
  ],
};
