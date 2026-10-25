import type { Metric } from "@/lib/api/types";

export function metricChartData(data: Metric[], range: string): Metric[] {
  let interval = 30000;
  if (range === "7d") interval = 300000;
  if (range === "30d") interval = 1800000;
  const out: Metric[] = [];
  for (const point of data) {
    const previous = out.at(-1);
    if (
      previous &&
      Date.parse(point.at) - Date.parse(previous.at) > interval * 2
    ) {
      out.push({
        ...point,
        at: new Date(Date.parse(previous.at) + interval).toISOString(),
        online: false,
        valid: false,
        cpuValid: false,
        network: [],
        devices: [],
        containers: [],
        networkRx: null,
        networkTx: null,
        diskRead: null,
        diskWrite: null,
        peakCpu: undefined,
        peakMemory: undefined,
        peakDisk: undefined,
      });
    }
    out.push(point);
  }
  return out;
}
