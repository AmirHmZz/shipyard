import { expect, it } from "vitest";

import { metricChartData } from "./chart-data";
const metric = {
  resourceId: "server",
  cpu: 10,
  memory: 20,
  disk: 30,
  online: true,
  containers: [],
  at: "2026-10-25T00:00:00Z",
};
it("breaks resource and I/O lines across missing collection intervals", () => {
  const rows = metricChartData(
    [metric, { ...metric, at: "2026-10-25T00:05:00Z" }],
    "1h",
  );
  expect(rows).toHaveLength(3);
  expect(rows[1]).toMatchObject({
    online: false,
    valid: false,
    cpuValid: false,
    networkRx: null,
  });
  expect(
    metricChartData([metric, { ...metric, at: "2026-10-25T00:05:00Z" }], "7d"),
  ).toHaveLength(2);
});
