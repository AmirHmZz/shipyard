import { post } from "@/lib/api/client";
import type { DeploymentCreationResult } from "../generics";
import { apiPath } from "@/lib/paths";

export function rollbackApplication(
  id: string,
  payload: { releaseId: string },
) {
  return post<DeploymentCreationResult>(
    apiPath`/applications/${id}/rollback`,
    payload,
  );
}
