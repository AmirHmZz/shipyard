import { apiPath } from "@/lib/paths";
import { api } from "@/lib/api/client";
import type { Resource } from "@/lib/api/types";
import type { Source } from "../generics";

export async function getComposeSource(app: Resource) {
  return api<Source>(apiPath`/applications/${app.id}/compose`);
}
