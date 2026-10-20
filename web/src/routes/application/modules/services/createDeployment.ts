import type { freshDeploySchema } from "@/lib/validation";

import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { DeploymentCreationResult } from "../generics";

export function createDeployment(
  id: string,
  payload:
    | ReturnType<typeof freshDeploySchema>["_output"]
    | Record<string, never>,
) {
  return post<DeploymentCreationResult>(
    apiPath`/applications/${id}/deploy`,
    payload,
  );
}
