import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { jobKeys, jobRunsSchema } from "../generics/jobs";
export function useJobRuns(id: string, cursor = "") {
  return useApiQuery({
    queryKey: jobKeys.runs(id, cursor),
    path:
      apiPath`/applications/${id}/runs` +
      "?" +
      new URLSearchParams({ before: cursor }),
    schema: jobRunsSchema,
    refetchInterval: 2000,
  });
}
