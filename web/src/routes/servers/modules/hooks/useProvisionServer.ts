import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { queuedResponseSchema } from "@/lib/schemas/acknowledgements";

export function useProvisionServer() {
  return useApiMutation({
    method: "POST",
    path: (id: string | undefined) => apiPath`/servers/${id}/provision`,
    body: () => ({}),
    schema: queuedResponseSchema,
    meta: {
      successMessage: "Provisioning queued. Track it in Settings → Jobs.",
    },
  });
}
