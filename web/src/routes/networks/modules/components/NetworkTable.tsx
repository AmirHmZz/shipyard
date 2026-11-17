import { Network } from "lucide-react";

import { FlushCard } from "@/components/FlushCard";
import { Empty } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { useNetworksPage } from "../hooks";

import { RegisteredNetworkRow } from "./RegisteredNetworkRow";
import { UnregisteredNetworkRow } from "./UnregisteredNetworkRow";
export type NetworkTableProps = {
  controller: ReturnType<typeof useNetworksPage>;
};
export function NetworkTable({ controller }: NetworkTableProps) {
  const { filter } = controller.state;
  const { rows, unregistered, byId, account, hasRows, showEmpty, emptyTitle } =
    controller.derived;
  const { handleNetworkAction, clearFilters } = controller.handlers;
  const { filtered } = controller.derived;
  const { controlById, saveControlNetwork } = controller.derived;
  if (!hasRows) {
    if (!showEmpty) return null;
    return (
      <Empty
        title={emptyTitle}
        description={
          filtered
            ? "Try a different search, type or status to find your network."
            : "Create a bridge network or register one already on your server."
        }
        icon={<Network />}
        action={
          filtered && (
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          )
        }
      />
    );
  }
  return (
    <FlushCard>
      <div className="flex items-center gap-2 border-b bg-muted/20 px-5 py-4">
        <Network className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Network inventory</h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {["Network", "Server", "Addresses", "Status", "Shipyard", ""].map(
              (value) => (
                <TableHead key={value} className="px-5">
                  {value || <span className="sr-only">Actions</span>}
                </TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        <TableBody onClick={handleNetworkAction}>
          {rows.map(({ resource, docker }) => (
            <RegisteredNetworkRow
              key={resource.id}
              resource={resource}
              docker={docker}
              byId={byId}
              canManage={!!account?.admin}
              controlNetwork={
                account?.admin ? controlById.get(resource.id) : undefined
              }
              attachmentPending={saveControlNetwork.isPending}
            />
          ))}
          {unregistered.map((network) => (
            <UnregisteredNetworkRow
              key={network.Id}
              network={network}
              filter={filter}
              serverName={byId.get(filter)?.name}
            />
          ))}
        </TableBody>
      </Table>
    </FlushCard>
  );
}
