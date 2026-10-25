import { Button } from "@/components/ui/button";

import { useNotificationDelivery, useTestNotification } from "../hooks";
export type NotificationDeliveryProps = { id: string };
export function NotificationDelivery({ id }: NotificationDeliveryProps) {
  const delivery = useNotificationDelivery(id);
  const test = useTestNotification(id);
  function send() {
    if (!test.isPending) test.mutate(undefined);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={send}
        disabled={test.isPending}
      >
        Send test notification
      </Button>
      {delivery.data && delivery.data.state !== "none" && (
        <span className="max-w-64 break-words text-xs text-muted-foreground">
          {delivery.data.state}
          {delivery.data.error && ` · ${delivery.data.error}`}
        </span>
      )}
    </div>
  );
}
