import { apiPath } from "@/lib/paths";
import type { ApplicationNetworkingResponse } from "../generics";
import { api } from "@/lib/api/client";
import type { Resource } from "@/lib/api/types";

// TODO(openapi): add application networking response to api/openapi.yaml.
export async function getApplicationNetworking(app: Resource) {
  return api<ApplicationNetworkingResponse>(
    apiPath`/applications/${app.id}/networking`,
  );
}
