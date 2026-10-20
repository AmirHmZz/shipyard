import type * as z from "zod/mini";

import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { previewCommitSchema } from "../generics";

export function updateApplicationVersion(
  id: string,
  payload: z.output<typeof previewCommitSchema>,
) {
  return post<unknown>(apiPath`/applications/${id}/approve-preview`, payload);
}
