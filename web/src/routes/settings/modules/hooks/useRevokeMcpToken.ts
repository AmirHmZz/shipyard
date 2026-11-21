import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import { settingsKeys } from "../generics";

export function useRevokeMcpToken() {
  return useApiMutation({
    method: "DELETE",
    path: (id: string) => apiPath`/settings/mcp-tokens/${id}`,
    schema: okResponseSchema,
    invalidate: [settingsKeys.mcpTokens],
    meta: { successMessage: "MCP token revoked" },
  });
}
