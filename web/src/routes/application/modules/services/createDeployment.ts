import { post } from "@/lib/api/client";
import type { DeploymentCreationResult } from "../generics";
import type { freshDeploySchema } from "@/lib/validation";
import { apiPath } from "@/lib/paths";

export function createDeployment(
  id: string,
  payload:
    ReturnType<typeof freshDeploySchema>["_output"] | Record<string, never>,
) {
  return post<DeploymentCreationResult>(
    apiPath`/applications/${id}/deploy`,
    payload,
  );
}
