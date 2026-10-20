import type * as z from "zod/mini";

import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { freshDeploySchema } from "../generics";
import type { DeploymentCreationResult } from "../generics";

export function createDeployment(
  id: string,
  payload:
    | z.output<ReturnType<typeof freshDeploySchema>>
    | Record<string, never>,
) {
  return post<DeploymentCreationResult>(
    apiPath`/applications/${id}/deploy`,
    payload,
  );
}
