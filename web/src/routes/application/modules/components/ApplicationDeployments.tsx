import type { useSearchParams } from "react-router";

import { RotateCcw } from "lucide-react";

import type { Deployment } from "@/lib/api/types";
import type { Resource } from "@/lib/api/types";

import { DeploymentTable } from "@/components/deployment-table";
import { Empty } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";

import type { Runtime } from "../generics";

import { LogStream } from "./Streams";

export function ApplicationDeployments({
  app,
  rows,
  deployments,
  releases,
  runtime,
  params,
  setParams,
  setConfirmAction,
  onDeleteDeployment,
}: {
  app: Resource;
  rows: Resource[];
  deployments: { data?: Deployment[] };
  releases: { data?: { id: string; commit: string; createdAt: string }[] };
  runtime: { data?: Runtime };
  params: URLSearchParams;
  setParams: ReturnType<typeof useSearchParams>[1];
  setConfirmAction: (action: string) => void;
  onDeleteDeployment: (deployment: Deployment) => void;
}) {
  const directCompose = app.data.source === "compose";
  const canDelete = (d: Deployment) =>
    !!app.canWrite &&
    !!runtime.data &&
    ["healthy", "failed", "recovery_failed"].includes(d.state) &&
    runtime.data.releaseId !== (d.releaseId || d.id) &&
    !deployments.data?.some(
      (other) =>
        ["queued", "building", "deploying"].includes(other.state) &&
        other.rollbackId === (d.releaseId || d.id),
    );
  return (
    <TabsContent value="deployments">
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        {deployments.data?.length ? (
          <DeploymentTable
            resources={rows}
            deployments={deployments.data}
            onDelete={app.canWrite ? onDeleteDeployment : undefined}
            canDelete={canDelete}
            onSelect={(deployment) =>
              setParams({ deployment, tab: "deployments" })
            }
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
      </Card>
      {params.get("deployment") && (
        <div className="mt-5">
          <LogStream deploymentId={params.get("deployment")!} />
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
          <CardContent className="space-y-3">
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
                    onClick={() => setConfirmAction("rollback:" + release.id)}
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
