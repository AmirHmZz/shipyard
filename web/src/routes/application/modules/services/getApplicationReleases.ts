import { apiPath } from "@/lib/paths";
import type { ApplicationReleasesResponse } from "../generics";
import { api } from "@/lib/api/client";

// TODO(openapi): add application releases response to api/openapi.yaml.
export async function getApplicationReleases(id: string) {
  return api<ApplicationReleasesResponse>(
    apiPath`/applications/${id}/releases`,
  );
}
