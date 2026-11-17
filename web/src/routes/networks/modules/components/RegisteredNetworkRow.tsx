import { Network, Server, Trash2, Users } from "lucide-react";
import { Link } from "react-router";

import type { Resource } from "@/lib/api/types";

import { StateBadge } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
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
    <TableRow className="[&>td]:px-5 [&>td]:py-4">
      <TableCell>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-primary/5 text-primary">
            <Network className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="max-w-64 truncate font-medium" title={r.name}>
              {r.name}
            </p>
            <p className="text-xs text-muted-foreground">{kindLabel}</p>
          </div>
        </div>
        {!!r.data.ingressApp && (
          <Link
            className="text-xs text-primary hover:underline"
            to={`/applications/${text(r.data, "ingressApp")}`}
          >
            {byId.get(String(r.data.ingressApp))?.name || "Application"}
          </Link>
        )}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2 text-sm">
          <Server className="size-3.5 shrink-0 text-muted-foreground" />
          {byId.get(String(r.data.serverId))?.name || "—"}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1.5">
          {visibleAddresses.map((subnet) => (
            <Badge
              key={subnet}
              variant="outline"
              className="font-mono text-[11px] font-normal"
            >
              {subnet}
            </Badge>
          ))}
          {!visibleAddresses.length && (
            <span className="text-muted-foreground">—</span>
          )}
          {docker && (
            <span className="text-xs text-muted-foreground">
              {docker.Driver} · {Object.keys(docker.Containers).length}{" "}
              containers
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <StateBadge state={text(r.data, "status") || "unknown"} />
        <p className="mt-1 max-w-64 whitespace-normal break-words text-xs text-destructive">
          {text(r.data, "error")}
        </p>
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
