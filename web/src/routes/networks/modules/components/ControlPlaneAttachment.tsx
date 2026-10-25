import type * as z from "zod/mini";

import { Button } from "@/components/ui/button";

import type { controlPlaneNetworkSchema } from "../generics";

export type ControlPlaneAttachmentProps = {
  network: z.infer<typeof controlPlaneNetworkSchema> | undefined;
  pending: boolean;
  ready: boolean;
};

export function ControlPlaneAttachment({
  network,
  pending,
  ready,
}: ControlPlaneAttachmentProps) {
  if (!network) return <span className="text-muted-foreground">—</span>;
  const needsRetry = network.desired !== network.attached || !!network.error;
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-xs text-muted-foreground">
        {network.attached ? "Attached" : "Detached"}
        {needsRetry && " · Pending"}
      </span>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          data-control-plane-network-id={network.networkId}
          data-attached={String(!network.desired)}
          disabled={pending || (!network.desired && !ready)}
        >
          {network.desired ? "Detach Shipyard" : "Attach Shipyard"}
        </Button>
        {needsRetry && (
          <Button
            variant="ghost"
            size="sm"
            data-control-plane-network-id={network.networkId}
            data-attached={String(network.desired)}
            disabled={pending}
          >
            Retry attachment
          </Button>
        )}
      </div>
      {network.error && (
        <p className="max-w-xs text-xs text-destructive">{network.error}</p>
      )}
    </div>
  );
}
