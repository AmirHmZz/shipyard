import { useApiQuery } from "@/lib/api/use-api-query";
import { buildInfoKeys } from "@/lib/query-keys";
import { buildInfoResponseSchema } from "@/lib/schemas/build-info";

export function useBuildInfo() {
  return useApiQuery({
    queryKey: buildInfoKeys.all,
    path: "/version",
    schema: buildInfoResponseSchema,
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
