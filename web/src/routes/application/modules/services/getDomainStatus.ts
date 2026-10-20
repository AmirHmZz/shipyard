import type { Resource } from "@/lib/api/types";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { DomainStatusResponse } from "../generics";

// TODO(openapi): add domain status response to api/openapi.yaml.
export async function getDomainStatus(route: Resource) {
  return api<DomainStatusResponse>(apiPath`/routes/${route.id}/status`);
}
