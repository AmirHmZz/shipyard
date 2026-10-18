import { apiPath } from "@/lib/paths";
import type { ApplicationServicesResponse } from "../generics";
import { api } from "@/lib/api/client";
import type { Resource } from "@/lib/api/types";

// TODO(openapi): add application services response to api/openapi.yaml.
export async function getApplicationServices(app: Resource) {
  return api<ApplicationServicesResponse>(
    apiPath`/applications/${app.id}/services`,
  );
}
