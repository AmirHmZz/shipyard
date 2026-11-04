import * as z from "zod/mini";

import { metricResponseSchema } from "@/lib/schemas/metrics";

export const dockerVersionResultResponseSchema = z.object({
  dockerVersion: z.string(),
});

export const getServerMetricsResponseSchema = z.array(metricResponseSchema);

export const serverStatusResponseSchema = z.object({
  online: z.nullable(z.boolean()),
});
