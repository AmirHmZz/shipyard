import { RotateCcw } from "lucide-react";

import { DeploymentTable } from "@/components/deployment-table";
import { FlushCard } from "@/components/FlushCard";
import { Empty } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";

import type { ApplicationDeploymentsOptions } from "../generics";

import { useDeploymentHistory } from "../hooks";
import { LogStream } from "./Streams";

export type ApplicationDeploymentsProps = ApplicationDeploymentsOptions;
export function ApplicationDeployments(props: ApplicationDeploymentsProps) {
  const { app, rows, deployments, releases, runtime, onDeleteDeployment } =
    props;
  const { derived, handlers } = useDeploymentHistory(props);
  const { directCompose, selectedDeployment } = derived;
  const { canDelete, selectDeployment, handleRollback } = handlers;
  return (
    <TabsContent value="deployments">
      <FlushCard>
        {deployments.data?.length ? (
          <DeploymentTable
            resources={rows}
            deployments={deployments.data}
            onDelete={app.canWrite ? onDeleteDeployment : undefined}
            canDelete={canDelete}
            onSelect={selectDeployment}
          />
        ) : (
          <Empty
            title="No deployments yet"
            description={
              directCompose
                ? "Save your Compose document and deploy to create your first release."
                : "Deploy from your selected branch to create your first release."
            }
          />
        )}
      </FlushCard>
      {selectedDeployment && (
        <div className="mt-5">
          <LogStream deploymentId={selectedDeployment} />
        </div>
      )}
      {!!releases.data?.length && (
        <Card className="mt-5 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Retained releases</CardTitle>
            <p className="text-xs text-muted-foreground">
              Rollback restores exact images and configuration. Volume and
              database changes stay in place.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3" onClick={handleRollback}>
            {releases.data.map((release) => (
              <div
                key={release.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <span className="font-mono text-xs">
                  {release.commit.startsWith("compose:")
                    ? release.commit
                    : release.commit.slice(0, 12)}{" "}
                  <span className="ml-3 text-muted-foreground">
                    {new Date(release.createdAt).toLocaleString()}
                  </span>
                </span>
                {release.id === runtime.data?.releaseId ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!app.canWrite}
                    data-release-id={release.id}
                  >
                    <RotateCcw />
                    Roll back
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}
