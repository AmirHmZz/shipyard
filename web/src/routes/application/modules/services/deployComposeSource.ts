import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { DeploymentCreationResult } from "../generics";

export function deployComposeSource(
  appId: string,
  payload: { version: number },
) {
  return post<DeploymentCreationResult>(
    apiPath`/applications/${appId}/deploy`,
    payload,
  );
}
