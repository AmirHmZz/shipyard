import * as z from "zod/mini";

import { metricResponseSchema } from "@/lib/schemas/metrics";

// TODO(openapi): document the Docker version check response.
export const dockerVersionResultResponseSchema = z.object({
  dockerVersion: z.string(),
});

export const getServerMetricsResponseSchema = z.array(metricResponseSchema);
