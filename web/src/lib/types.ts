import type * as z from "zod/mini";

import type { RESOURCE_KINDS, PROJECT_ROLES } from "./enums";
import type {
  httpReadinessChecksSchema,
  previewRoutingSchema,
} from "./schemas/application";

export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export type HTTPReadinessCheck = z.infer<
  typeof httpReadinessChecksSchema
>[number];
export type PreviewRouting = z.infer<typeof previewRoutingSchema>;

import type { dnsCredentialSchema } from "./schemas/dns";
import type { resourceFormSchema } from "./schemas/resource-form";
import type { variableWriteSchema } from "./schemas/variables";
export type DNSCredentials = z.output<typeof dnsCredentialSchema>;
export type ResourcePayload = z.output<ReturnType<typeof resourceFormSchema>>;
export type SaveResourceValues = {
  existingId: string | undefined;
  kind: ResourceKind;
  payload: ResourcePayload;
};
export type VariableValues = z.output<typeof variableWriteSchema>;
