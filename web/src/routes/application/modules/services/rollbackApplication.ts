import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { DeploymentCreationResult } from "../generics";

export function rollbackApplication(
  id: string,
  payload: { releaseId: string },
) {
  return post<DeploymentCreationResult>(
    apiPath`/applications/${id}/rollback`,
    payload,
  );
}
