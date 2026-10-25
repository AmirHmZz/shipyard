import { useApiQuery } from "@/lib/api/use-api-query";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { apiPath } from "@/lib/paths";
import { notificationDeliverySchema } from "@/lib/schemas/monitoring";
export function useNotificationDelivery(id: string) {
  return useApiQuery({
    queryKey: monitoringKeys.delivery(id),
    path: apiPath`/notifications/${id}/delivery`,
    schema: notificationDeliverySchema,
    refetchInterval: 5000,
  });
}
