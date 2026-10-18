import { apiPath } from "@/lib/paths";
import { api } from "@/lib/api/client";
import type { Resource } from "@/lib/api/types";
import type { Status } from "../generics";

export async function getGitSetupStatus(existing: Resource | undefined) {
  return api<Status>(apiPath`/git/${existing!.id}/setup`);
}
