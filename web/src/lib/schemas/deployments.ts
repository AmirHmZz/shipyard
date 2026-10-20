import * as z from "zod/mini";

export const deploymentResponseSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  state: z.string(),
  phase: z.string(),
  commit: z.string(),
  error: z.string(),
  releaseId: z.string(),
  rollbackId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deleting: z.optional(z.union([z.literal(false), z.literal(true)])),
  deletionError: z.optional(z.string()),
});
