import * as z from "zod/mini";

export const domainStatusResponseSchema = z.object({
  routeId: z.string(),
  domain: z.string(),
  dns: z.string(),
  propagation: z.string(),
  certificate: z.string(),
  routing: z.string(),
  error: z.string(),
  expiresAt: z.nullable(z.string()),
  records: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      name: z.string(),
      content: z.string(),
      owned: z.boolean(),
    }),
  ),
  sync: z.optional(
    z.object({
      id: z.string(),
      state: z.string(),
      attempts: z.number(),
      error: z.string(),
    }),
  ),
});
