import { Trash2, Users } from "lucide-react";
import { Link } from "react-router";

import type { Resource } from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { text } from "@/lib/resource-fields";

import type { DockerNetwork } from "../generics";
import type { ControlPlaneAttachmentProps } from "./ControlPlaneAttachment";

import { subnets } from "../utils";
import { ControlPlaneAttachment } from "./ControlPlaneAttachment";
export type RegisteredNetworkRowProps = {
  resource: Resource;
  docker: DockerNetwork | undefined;
  byId: Map<string, Resource>;
  canManage: boolean;
  controlNetwork: ControlPlaneAttachmentProps["network"];
  attachmentPending: boolean;
};
export function RegisteredNetworkRow({
  resource: r,
  docker,
  byId,
  canManage,
  controlNetwork,
  attachmentPending,
}: RegisteredNetworkRowProps) {
  const addresses = subnets(docker);
  let kindLabel = "External · attach only";
  if (r.data.managed) kindLabel = "Shipyard-managed";
  if (r.data.ingressApp) kindLabel = "Application ingress";
  const visibleAddresses = (
    addresses.length
      ? addresses
      : [text(r.data, "subnet"), text(r.data, "ipv6Subnet")]
  ).filter(Boolean);
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{r.name}</p>
        <p className="text-xs text-muted-foreground">{kindLabel}</p>
        {!!r.data.ingressApp && (
          <Link
            className="text-xs text-primary hover:underline"
            to={`/applications/${text(r.data, "ingressApp")}`}
          >
            {byId.get(String(r.data.ingressApp))?.name || "Application"}
          </Link>
        )}
      </TableCell>
      <TableCell>{byId.get(String(r.data.serverId))?.name}</TableCell>
      <TableCell className="font-mono text-xs">
        {visibleAddresses.map((subnet) => (
          <p key={subnet}>{subnet}</p>
        ))}
      </TableCell>
      <TableCell>
        {text(r.data, "status")}
        <p className="text-xs text-destructive">{text(r.data, "error")}</p>
      </TableCell>
      <TableCell>
        <ControlPlaneAttachment
          network={controlNetwork}
          pending={attachmentPending}
          ready={r.data.status === "ready"}
        />
      </TableCell>
      <TableCell className="text-right">
        {!r.data.ingressApp && (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Network team access"
              disabled={!canManage}
              asChild
            >
              <Link to={`/configure/access/${r.id}?return=/networks`}>
                <Users />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                r.data.managed ? "Delete network" : "Unregister network"
              }
              disabled={
                !canManage ||
                !!controlNetwork?.desired ||
                !!controlNetwork?.attached
              }
              title={
                controlNetwork?.desired || controlNetwork?.attached
                  ? "Detach Shipyard before removing this network"
                  : undefined
              }
              data-network-id={r.id}
            >
              <Trash2 />
            </Button>
          </>
        )}
      </TableCell>
    </TableRow>
  );
}
