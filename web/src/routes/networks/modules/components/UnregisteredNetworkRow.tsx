import { Link } from "react-router";

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
    <TableRow>
      <TableCell>
        <p className="font-medium">{network.Name}</p>
        <p className="text-xs text-muted-foreground">
          {network.Driver} · {kindLabel}
        </p>
      </TableCell>
      <TableCell>{serverName}</TableCell>
      <TableCell className="font-mono text-xs">
        {addresses.map((subnet) => (
          <p key={subnet}>{subnet}</p>
        ))}
      </TableCell>
      <TableCell>Available</TableCell>
      <TableCell className="text-right">
        {register && (
          <Button variant="outline" size="sm" asChild>
            <Link
              to={`/configure/network/new?${new URLSearchParams({ server: filter, dockerId: network.Id, name: network.Name, return: "/networks" })}`}
            >
              Register
            </Link>
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
