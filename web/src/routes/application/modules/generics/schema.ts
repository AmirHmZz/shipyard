import * as z from "zod/mini";

import { jsonText } from "@/lib/schemas/form-rules";

export { previewApplicationRoutingSchema } from "@/lib/schemas/application";

export const logMessageSchema = z.pipe(
  jsonText,
  z.object({ message: z.string() }),
);
export const logStatusSchema = z.pipe(
  jsonText,
  z.object({ state: z.string(), error: z.optional(z.string()) }),
);

import { metricResponseSchema } from "@/lib/schemas/metrics";

export const previewFormSchema = z
  .object({
    enabled: z.boolean(),
    domain: z.string().check(z.trim()),
    zone: z.string(),
  })
  .check(
    z.check((context) => {
      const value = context.value;
      if (value.enabled && !value.zone)
        context.issues.push({
          code: "custom",
          path: ["zone"],
          message: "Select a connected zone.",
          input: context.value,
        });
      if (value.enabled && !value.domain)
        context.issues.push({
          code: "custom",
          path: ["domain"],
          message: "Enter a preview domain.",
          input: context.value,
        });
    }),
  );

export const previewCommitSchema = z.object({
  sha: z
    .string()
    .check(z.trim())
    .check(
      z.regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i, "Enter a full commit SHA."),
    ),
});

export function freshDeploySchema(name: string) {
  return z.object({
    fresh: z.literal(true),
    confirmName: z.literal(name, {
      error: "Type the application name to confirm.",
    }),
    version: z.coerce.number().check(z.int()).check(z.gte(0)),
  });
}

export const composeSourceSchema = z.looseObject({
  yaml: z
    .string()
    .check(
      z.refine(
        (value) => value.trim().length > 0,
        "Compose document is required.",
      ),
    ),
  version: z.coerce.number().check(z.int()).check(z.gte(0)),
});

const networkConnectionSchema = z.object({
  networkId: z.string(),
  ipv4: z.optional(z.string()),
  ipv6: z.optional(z.string()),
});

const publishedPortSchema = z.object({
  host: z.string(),
  published: z.coerce
    .number()
    .check(z.int())
    .check(z.gte(1))
    .check(z.lte(65535)),
  target: z.coerce.number().check(z.int()).check(z.gte(1)).check(z.lte(65535)),
  protocol: z.string(),
});

export const networkingPayloadSchema = z.object({
  version: z.coerce.number().check(z.int()).check(z.gte(0)),
  services: z.record(
    z.string(),
    z.looseObject({
      hostname: z.optional(z.string()),
      connections: z.array(networkConnectionSchema),
    }),
  ),
});

export const publishedPortsPayloadSchema = z.object({
  version: z.coerce.number().check(z.int()).check(z.gte(0)),
  services: z.record(z.string(), z.array(publishedPortSchema)),
});

export const volumeMountResponseSchema = z.object({
  service: z.string(),
  container: z.string(),
  path: z.string(),
});

export const applicationVolumeResponseSchema = z.object({
  name: z.string(),
  serverId: z.string(),
  serverName: z.string(),
  type: z.enum(["named", "anonymous"]),
  driver: z.string(),
  createdAt: z.string(),
  mounts: z.array(volumeMountResponseSchema),
  inUse: z.boolean(),
  sizeBytes: z.union([z.null(), z.number()]),
  measuredAt: z.union([z.null(), z.string()]),
});

export const applicationVolumesResponseSchema = z.object({
  volumes: z.array(applicationVolumeResponseSchema),
  errors: z.array(z.object({ serverId: z.string(), error: z.string() })),
});

export const composeSourceResponseSchema = z.object({
  yaml: z.string(),
  version: z.number(),
});

export const runtimeResponseSchema = z.object({
  status: z.string(),
  releaseId: z.optional(z.string()),
  commit: z.optional(z.string()),
  containers: z.optional(z.nullable(z.array(z.string()))),
  targets: z.optional(
    z.nullable(
      z.array(
        z.object({
          port: z.number(),
          address: z.string(),
          networkId: z.string(),
        }),
      ),
    ),
  ),
});

export const attachmentResponseSchema = z.object({
  networkId: z.string(),
  ipv4: z.optional(z.string()),
  ipv6: z.optional(z.string()),
});

export const networkServiceResponseSchema = z.object({
  hostname: z.optional(z.string()),
  connections: z.pipe(
    z.nullable(z.array(attachmentResponseSchema)),
    z.transform((value) => value ?? []),
  ),
});

// TODO(openapi): document networking, releases, services, route status and deployment creation responses.
export const applicationNetworkingResponseSchema = z.object({
  version: z.number(),
  services: z.record(z.string(), networkServiceResponseSchema),
  pending: z.boolean(),
  endpoints: z.optional(
    z.nullable(
      z.array(
        z.object({
          service: z.string(),
          replica: z.number(),
          ipv4: z.optional(z.string()),
          ipv6: z.optional(z.string()),
          ingress: z.boolean(),
          dockerName: z.string(),
        }),
      ),
    ),
  ),
});

export const applicationReleasesResponseSchema = z.array(
  z.object({
    id: z.string(),
    commit: z.string(),
    createdAt: z.string(),
    images: z.pipe(
      z.nullable(z.record(z.string(), z.string())),
      z.transform((value) => value ?? {}),
    ),
  }),
);

export const applicationServicesResponseSchema = z.array(
  z.object({
    name: z.string(),
    replicas: z.number(),
    ignoredPorts: z.boolean(),
  }),
);

export const domainStatusResponseSchema = z.record(z.string(), z.string());

export const deploymentCreationResultResponseSchema = z.object({
  id: z.string(),
});

export const getApplicationMetricsResponseSchema =
  z.array(metricResponseSchema);
