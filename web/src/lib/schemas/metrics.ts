import * as z from "zod/mini";

const ioRateSchema = z.object({
  name: z.string(),
  read: z.nullable(z.number()),
  write: z.nullable(z.number()),
});

export const metricResponseSchema = z.object({
  resourceId: z.string(),
  cpu: z.number(),
  memory: z.number(),
  disk: z.number(),
  online: z.boolean(),
  at: z.string(),
  status: z.optional(z.string()),
  valid: z.optional(z.boolean()),
  cpuValid: z.optional(z.boolean()),
  memoryBytes: z.optional(z.number()),
  memoryTotalBytes: z.optional(z.number()),
  network: z.optional(z.array(ioRateSchema)),
  devices: z.optional(z.array(ioRateSchema)),
  networkRx: z.optional(z.nullable(z.number())),
  networkTx: z.optional(z.nullable(z.number())),
  diskRead: z.optional(z.nullable(z.number())),
  diskWrite: z.optional(z.nullable(z.number())),
  peakCpu: z.optional(z.number()),
  peakMemory: z.optional(z.number()),
  peakDisk: z.optional(z.number()),
  availability: z.optional(z.number()),
  samples: z.optional(z.number()),
  containers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      cpu: z.number(),
      memory: z.number(),
      valid: z.optional(z.boolean()),
      cpuValid: z.optional(z.boolean()),
      memoryBytes: z.optional(z.number()),
      networkRx: z.optional(z.nullable(z.number())),
      networkTx: z.optional(z.nullable(z.number())),
      diskRead: z.optional(z.nullable(z.number())),
      diskWrite: z.optional(z.nullable(z.number())),
    }),
  ),
});
