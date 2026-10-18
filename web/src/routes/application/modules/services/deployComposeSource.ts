import { post } from "@/lib/api/client";
import type { DeploymentCreationResult } from "../generics";
import { apiPath } from "@/lib/paths";

export function deployComposeSource(
  appId: string,
  payload: { version: number },
) {
  return post<DeploymentCreationResult>(
    apiPath`/applications/${appId}/deploy`,
    payload,
  );
}
