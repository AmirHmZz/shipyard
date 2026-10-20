import type { ChangeEvent } from "react";

import type { Service } from "../generics";

export function useNetworkConnection(
  service: string,
  connection: Service["connections"][number],
  connections: Service["connections"],
  update: (service: string, next: Partial<Service>) => void,
) {
  function changeNetwork(networkId: string) {
    update(service, {
      connections: connections.map((row) =>
        row.rowId === connection.rowId ? { rowId: row.rowId, networkId } : row,
      ),
    });
  }
  function changeAddress(event: ChangeEvent<HTMLInputElement>) {
    const family = event.currentTarget.dataset.addressFamily;
    const value = event.currentTarget.value;
    if (family !== "ipv4" && family !== "ipv6") return;
    update(service, {
      connections: connections.map((row) =>
        row.rowId === connection.rowId ? { ...row, [family]: value } : row,
      ),
    });
  }
  function disconnect() {
    update(service, {
      connections: connections.filter((row) => row.rowId !== connection.rowId),
    });
  }
  return {
    state: {},
    derived: {},
    handlers: { changeNetwork, changeAddress, disconnect },
  };
}
