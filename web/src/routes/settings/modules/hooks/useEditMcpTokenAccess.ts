import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import type { McpTokenAccess } from "../generics";

import { settingsKeys } from "../generics";

export function useEditMcpTokenAccess() {
  return useApiMutation({
    method: "PATCH",
    path: ({ id }: McpTokenAccess & { id: string }) =>
      apiPath`/settings/mcp-tokens/${id}`,
    body: ({ projectIds, projectPermissions }) => ({
      projectIds,
      projectPermissions,
    }),
    schema: okResponseSchema,
    invalidate: [settingsKeys.mcpTokens],
    meta: { successMessage: "Project access updated" },
  });
}
