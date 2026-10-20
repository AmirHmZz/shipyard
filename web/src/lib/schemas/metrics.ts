import * as z from "zod/mini";

export const metricResponseSchema = z.object({
  resourceId: z.string(),
  cpu: z.number(),
  memory: z.number(),
  disk: z.number(),
  online: z.boolean(),
  at: z.string(),
  containers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      cpu: z.number(),
      memory: z.number(),
    }),
  ),
});
