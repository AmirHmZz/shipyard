import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import type { McpTokenRecreation } from "../generics";

import { issuedMcpTokenSchema, settingsKeys } from "../generics";

export function useRecreateMcpToken() {
  return useApiMutation({
    method: "POST",
    path: ({ id }: McpTokenRecreation & { id: string }) =>
      apiPath`/settings/mcp-tokens/${id}/recreate`,
    body: ({ expiryDays }) => ({ expiryDays }),
    schema: issuedMcpTokenSchema,
    invalidate: [settingsKeys.mcpTokens],
    gcTime: 0,
  });
}
