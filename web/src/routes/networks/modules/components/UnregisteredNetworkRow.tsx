import { Network, Plus, Server } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

import type { DockerNetwork } from "../generics";

import { subnets } from "../utils";
export type UnregisteredNetworkRowProps = {
  network: DockerNetwork;
  filter: string;
  serverName: string | undefined;
};
export function UnregisteredNetworkRow({
  network,
  filter,
  serverName,
}: UnregisteredNetworkRowProps) {
  const register =
    network.Driver === "bridge" &&
    network.Name !== "bridge" &&
    !network.Labels?.["shipyard.network"];
  let kindLabel = "Not registered";
  if (["bridge", "host", "none"].includes(network.Name))
    kindLabel = "Docker built-in";
  if (network.Labels?.["shipyard.network"]) kindLabel = "Shipyard-managed";
  const addresses = subnets(network);
  return (
    <TableRow className="[&>td]:px-5 [&>td]:py-4">
      <TableCell>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
            <Network className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="max-w-64 truncate font-medium" title={network.Name}>
              {network.Name}
            </p>
            <p className="text-xs text-muted-foreground">
              {network.Driver} · {kindLabel}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2 text-sm">
          <Server className="size-3.5 shrink-0 text-muted-foreground" />
          {serverName || "—"}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1.5">
          {addresses.map((subnet) => (
            <Badge
              key={subnet}
              variant="outline"
              className="font-mono text-[11px] font-normal"
            >
              {subnet}
            </Badge>
          ))}
          {!addresses.length && (
            <span className="text-muted-foreground">—</span>
          )}
          <span className="text-xs text-muted-foreground">
            {Object.keys(network.Containers).length} containers
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-normal text-muted-foreground">
          Available
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">—</TableCell>
      <TableCell className="text-right">
        {register && (
          <Button variant="outline" size="sm" asChild>
            <Link
              to={`/configure/network/new?${new URLSearchParams({ server: filter, dockerId: network.Id, name: network.Name, return: "/networks" })}`}
            >
              <Plus />
              Register
            </Link>
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
