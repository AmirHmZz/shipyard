import { Empty } from "@/components/Shared";
import { Card } from "@/components/ui/card";
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
  const { handleNetworkAction } = controller.handlers;
  const { controlById, saveControlNetwork } = controller.derived;
  if (!hasRows) {
    if (!showEmpty) return null;
    return (
      <Empty
        title={emptyTitle}
        description="Create a bridge network or register one already on your server."
      />
    );
  }
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            {["Network", "Server", "Addresses", "Status", "Shipyard", ""].map(
              (value) => (
                <TableHead key={value}>{value}</TableHead>
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
    </Card>
  );
}
