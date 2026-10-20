import type { previewCommitSchema } from "@/lib/validation";

import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function updateApplicationVersion(
  id: string,
  payload: typeof previewCommitSchema._output,
) {
  return post<unknown>(apiPath`/applications/${id}/approve-preview`, payload);
}
