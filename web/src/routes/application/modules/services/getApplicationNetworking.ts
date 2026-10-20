import type { Resource } from "@/lib/api/types";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { ApplicationNetworkingResponse } from "../generics";

// TODO(openapi): add application networking response to api/openapi.yaml.
export async function getApplicationNetworking(app: Resource) {
  return api<ApplicationNetworkingResponse>(
    apiPath`/applications/${app.id}/networking`,
  );
}
