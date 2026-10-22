import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { jobKeys, jobRunSchema } from "../generics/jobs";
export function useJobRun(id: string, run: string) {
  return useApiQuery({
    queryKey: jobKeys.run(id, run),
    path: apiPath`/applications/${id}/runs/${run}`,
    schema: jobRunSchema,
    enabled: !!run,
    refetchInterval: 2000,
  });
}
