import type * as z from "zod/mini";

import type { serviceOptionResponseSchema } from "@/lib/schemas/service-option";
import type { zoneOptionResponseSchema } from "@/lib/schemas/zone-option";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

// TODO(openapi): add the option response shapes to the generated schema.

export type ZoneOption = z.infer<typeof zoneOptionResponseSchema>;

export type ServiceOption = z.infer<typeof serviceOptionResponseSchema>;

export function getProviderZones(parent: string) {
  return api<ZoneOption[]>(apiPath`/dns/${parent}/zones`);
}

export function getServiceOptions(parent: string) {
  return api<ServiceOption[]>(apiPath`/applications/${parent}/services`);
}
