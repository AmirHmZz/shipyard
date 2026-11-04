import { Activity, SlidersHorizontal } from "lucide-react";

import { SelectControl } from "@/components/SelectControl";
import { ErrorState, Loading, PageHeader } from "@/components/Shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useMonitoringPage } from "../hooks/useMonitoringPage";
import { MonitoringDefaults } from "./MonitoringDefaults";
import { MonitoringResourceDetail } from "./MonitoringResourceDetail";

const resourceTypes = [
  { value: "all", label: "All resources" },
  { value: "server", label: "Servers" },
  { value: "application", label: "Applications" },
];

const historyRanges = [
  { value: "1h", label: "Last hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export type MonitoringMainViewProps = Record<string, never>;
export function MonitoringMainView() {
  const page = useMonitoringPage();
  if (page.query.isPending) return <Loading />;
  if (page.query.error) return <ErrorState error={page.query.error} />;

  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        title="Monitoring"
        description="Track resource usage, container activity and alerts across your servers and applications."
      />
      <Tabs value={page.view} onValueChange={page.selectView} className="gap-5">
        <TabsList aria-label="Monitoring view">
          <TabsTrigger value="resources">
            <Activity aria-hidden="true" />
            Resources
          </TabsTrigger>
          <TabsTrigger value="defaults">
            <SlidersHorizontal aria-hidden="true" />
            Alert defaults
          </TabsTrigger>
        </TabsList>
        <TabsContent value="resources" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <SelectControl
              value={page.type}
              onValueChange={page.selectType}
              options={resourceTypes}
              triggerProps={{ "aria-label": "Resource type" }}
            />
            <SelectControl
              value={page.selected?.id ?? ""}
              onValueChange={page.selectResource}
              options={page.resources.map((resource) => ({
                value: resource.id,
                label: `${resource.name} · ${resource.status}`,
              }))}
              disabled={!page.selected}
              placeholder="No resources"
              triggerProps={{
                "aria-label": "Monitored resource",
                className: "min-w-0 max-w-full sm:max-w-xs",
              }}
            />
            <SelectControl
              value={page.range}
              onValueChange={page.selectRange}
              options={historyRanges}
              triggerProps={{
                "aria-label": "History range",
                className: "sm:ml-auto",
              }}
            />
          </div>
          {page.selected ? (
            <MonitoringResourceDetail
              key={page.selected.id}
              resource={page.selected}
              range={page.range}
            />
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No resources available to monitor.
            </p>
          )}
        </TabsContent>
        <TabsContent value="defaults">
          <MonitoringDefaults />
        </TabsContent>
      </Tabs>
    </>
  );
}
