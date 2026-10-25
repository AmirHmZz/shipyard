import { ErrorState, Loading } from "@/components/Shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useMonitoringIncidents } from "../hooks";
export type MonitoringIncidentsProps = { id: string };
export function MonitoringIncidents({ id }: MonitoringIncidentsProps) {
  const query = useMonitoringIncidents(id);
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Alert incidents</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
          {query.data?.length ? (
            query.data.map((incident) => (
              <div
                key={incident.id}
                className="flex flex-wrap justify-between gap-2 border-b pb-3 text-sm"
              >
                <span>
                  {incident.kind} · {incident.state}
                </span>
                <span className="text-muted-foreground">
                  {new Date(incident.since).toLocaleString()}
                  {incident.resolvedAt &&
                    ` → ${new Date(incident.resolvedAt).toLocaleString()}`}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No incidents recorded.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
