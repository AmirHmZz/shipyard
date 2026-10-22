import type { Resource } from "@/lib/api/types";

import type { DockerNetwork } from "../generics";

export function networkRows(
  resources: Resource[],
  inventory: DockerNetwork[],
  filter: string,
) {
  const networks = resources.filter(
    (resource) =>
      resource.kind === "network" &&
      (!filter || resource.data.serverId === filter),
  );
  const byDockerId = new Map<
    string,
    { network: DockerNetwork; order: number }
  >();
  const byLabel = new Map<string, { network: DockerNetwork; order: number }>();
  inventory.forEach((network, order) => {
    if (!byDockerId.has(network.Id))
      byDockerId.set(network.Id, { network, order });
    const label = network.Labels?.["shipyard.network"];
    if (label && !byLabel.has(label)) byLabel.set(label, { network, order });
  });
  const registered = new Set<string>();
  const rows = networks.map((resource) => {
    const byId = byDockerId.get(String(resource.data.dockerId || ""));
    const label = byLabel.get(resource.id);
    let docker = byId?.network || label?.network;
    if (byId && label) {
      docker = label.network;
      if (byId.order < label.order) docker = byId.network;
    }
    if (docker) registered.add(docker.Id);
    return { id: resource.id, name: resource.name, resource, docker };
  });
  return {
    rows,
    unregistered: inventory.filter((network) => !registered.has(network.Id)),
  };
}
