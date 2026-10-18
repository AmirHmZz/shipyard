import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function createApplicationPreview(
  previewId: string,
  payload: { sha: unknown },
) {
  return post<unknown>(
    apiPath`/applications/${previewId}/approve-preview`,
    payload,
  );
}
