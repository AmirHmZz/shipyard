import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { grantKeys } from "@/lib/query-keys";
import { applicationDomainAccessSchema } from "@/lib/schemas/hostname-grants";

export function useApplicationDomainAccess(appId: string, enabled = true) {
  return useApiQuery({
    queryKey: grantKeys.application(appId),
    path: apiPath`/applications/${appId}/domain-access`,
    schema: applicationDomainAccessSchema,
    enabled: enabled && !!appId,
  });
}
