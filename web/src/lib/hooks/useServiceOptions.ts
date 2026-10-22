import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { applicationServiceKeys } from "@/lib/query-keys";
import { getServiceOptionsResponseSchema } from "@/lib/schemas/endpoint-responses";
export function useServiceOptions(parent: string, open: boolean) {
  return useApiQuery({
    queryKey: applicationServiceKeys.parent(parent),
    path: apiPath`/applications/${parent}/services`,
    schema: getServiceOptionsResponseSchema,
    enabled: open && !!parent,
    retry: false,
  });
}
