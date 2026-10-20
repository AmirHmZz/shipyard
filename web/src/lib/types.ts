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
