import { useApiMutation } from "@/lib/api/use-api-mutation";

import type { McpTokenInput } from "../generics";

import { issuedMcpTokenSchema, settingsKeys } from "../generics";

export function useIssueMcpToken() {
  return useApiMutation({
    method: "POST",
    path: "/settings/mcp-tokens",
    body: (input: McpTokenInput) => input,
    schema: issuedMcpTokenSchema,
    invalidate: [settingsKeys.mcpTokens],
    gcTime: 0,
  });
}
