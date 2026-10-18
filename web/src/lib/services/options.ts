import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

// TODO(openapi): add the option response shapes to the generated schema.

export type ZoneOption = { id: string; name: string };

export type ServiceOption = { name: string; ignoredPorts: boolean };

export function getProviderZones(parent: string) {
  return api<ZoneOption[]>(apiPath`/dns/${parent}/zones`);
}

export function getServiceOptions(parent: string) {
  return api<ServiceOption[]>(apiPath`/applications/${parent}/services`);
}
