import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { queuedResponseSchema } from "@/lib/schemas/acknowledgements";

export function useApprovePreview(options?: {
  refreshAll?: boolean;
  successMessage?: string;
}) {
  return useApiMutation({
    method: "POST",
    path: ({ id }: { id: string; sha: string }) =>
      apiPath`/applications/${id}/approve-preview`,
    body: ({ sha }) => ({ sha }),
    schema: queuedResponseSchema,
    meta: { successMessage: options?.successMessage },
    onSettled: (_data, _error, _variables, _snapshot, context) => {
      if (options?.refreshAll) return context.client.invalidateQueries();
      return context.client.invalidateQueries({ queryKey: resourceKeys.all });
    },
  });
}
