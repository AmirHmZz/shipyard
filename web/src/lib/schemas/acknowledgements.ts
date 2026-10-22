import * as z from "zod/mini";

export const okResponseSchema = z.object({ ok: z.boolean() });
export const queuedResponseSchema = z.object({ queued: z.boolean() });
export const jobResponseSchema = z.object({ jobId: z.string() });
export const deletionResponseSchema = z.object({
  ok: z.boolean(),
  jobId: z.optional(z.string()),
});
