import { useApiMutation } from "@/lib/api/use-api-mutation";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { apiPath } from "@/lib/paths";
import { notificationTestSchema } from "@/lib/schemas/monitoring";
export function useTestNotification(id: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/notifications/${id}/test`,
    body: () => ({}),
    schema: notificationTestSchema,
    invalidate: [monitoringKeys.delivery(id)],
    meta: { successMessage: "Test notification queued" },
  });
}
