import type { Runtime } from "./types";

export type ContainerDetail = NonNullable<Runtime["containerDetails"]>[number];

export function containerOptions(
  containers: string[],
  details: ContainerDetail[],
) {
  const byID = new Map(details.map((detail) => [detail.id, detail]));
  const counts = new Map<string, number>();
  for (const id of containers) {
    const service = byID.get(id)?.service;
    if (service) counts.set(service, (counts.get(service) ?? 0) + 1);
  }
  return containers.map((id) => {
    const detail = byID.get(id);
    let label = detail?.name || id.slice(0, 12);
    if (detail?.service) {
      label = detail.service;
      if ((counts.get(detail.service) ?? 0) > 1)
        label += ` (${detail.replica || detail.name || id.slice(0, 12)})`;
    }
    return { id, label };
  });
}
