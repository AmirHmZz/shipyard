import { useSearchParams } from "react-router";

import { monitoringRangeSchema } from "@/lib/schemas/monitoring";

import { useMonitoringResources } from "./useMonitoringResources";

export function useMonitoringPage() {
  const query = useMonitoringResources();
  const [params, setParams] = useSearchParams();
  const type = params.get("type") || "all";
  const view = params.get("view") || "resources";
  const parsed = monitoringRangeSchema.safeParse(params.get("range") || "24h");
  const range = parsed.success ? parsed.data : "24h";
  const resources = (query.data || []).filter(
    (r) => type === "all" || r.kind === type,
  );
  const selected =
    resources.find((r) => r.id === params.get("resourceId")) || resources[0];
  function changeParam(name: string, value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(name, value);
      return next;
    });
  }
  function selectResource(value: string) {
    changeParam("resourceId", value);
  }
  function selectRange(value: string) {
    changeParam("range", value);
  }
  function selectType(value: string) {
    changeParam("type", value);
  }
  function selectView(value: string) {
    changeParam("view", value);
  }
  return {
    query,
    resources,
    selected,
    range,
    type,
    view,
    selectResource,
    selectRange,
    selectType,
    selectView,
  };
}
