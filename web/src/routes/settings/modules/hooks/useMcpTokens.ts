import { useApiQuery } from "@/lib/api/use-api-query";

import { mcpTokenInventorySchema, settingsKeys } from "../generics";

export function useMcpTokens() {
  return useApiQuery({
    queryKey: settingsKeys.mcpTokens,
    path: "/settings/mcp-tokens",
    schema: mcpTokenInventorySchema,
  });
}
