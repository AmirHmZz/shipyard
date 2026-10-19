import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";
import type { ApplicationVolumesResponse } from "../generics";

export function getApplicationVolumes(id: string) {
  return api<ApplicationVolumesResponse>(apiPath`/applications/${id}/volumes`);
}
