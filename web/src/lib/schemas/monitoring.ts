import * as z from "zod/mini";

import { metricResponseSchema } from "./metrics";

export const monitoringRangeSchema = z.enum(["1h", "6h", "24h", "7d", "30d"]);
export const monitoringPolicySchema = z.object({
  enabled: z.boolean(),
  cpu: z.number().check(z.gte(1), z.lte(100000)),
  memory: z.number().check(z.gte(1), z.lte(100)),
  disk: z.number().check(z.gte(1), z.lte(100)),
  sustainedSeconds: z.number().check(z.int(), z.gte(30), z.lte(86400)),
  offlineSeconds: z.number().check(z.int(), z.gte(30), z.lte(86400)),
  destinations: z.array(z.string()),
});
export const monitoringDefaultsSchema = z.object({
  server: monitoringPolicySchema,
  application: monitoringPolicySchema,
});
export const monitoringPolicyStateSchema = z.object({
  mode: z.enum(["inherit", "override", "disabled"]),
  policy: monitoringPolicySchema,
});
export const monitoringResourcesSchema = z.array(
  z.object({
    id: z.string(),
    kind: z.enum(["server", "application"]),
    name: z.string(),
    serverId: z.string(),
    status: z.string(),
    latest: z.nullable(metricResponseSchema),
  }),
);
export const monitoringIncidentsSchema = z.array(
  z.object({
    id: z.string(),
    resourceId: z.string(),
    kind: z.string(),
    state: z.enum(["pending", "firing", "resolved"]),
    since: z.string(),
    firedAt: z.nullable(z.string()),
    resolvedAt: z.nullable(z.string()),
    destinations: z.array(z.string()),
    data: metricResponseSchema,
  }),
);
export const certificateNetworkSchema = z.object({ proxyId: z.string() });
export const notificationTestSchema = z.object({ jobId: z.string() });
export const notificationDeliverySchema = z.object({
  state: z.string(),
  error: z.string(),
  at: z.nullable(z.string()),
});
export type MonitoringPolicy = z.infer<typeof monitoringPolicySchema>;
export type MonitoringPolicyState = z.infer<typeof monitoringPolicyStateSchema>;
export type MonitoringDefaults = z.infer<typeof monitoringDefaultsSchema>;
export type MonitoringResource = z.infer<
  typeof monitoringResourcesSchema
>[number];
