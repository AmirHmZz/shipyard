import type { FormEvent } from "react";
import type { useSearchParams } from "react-router";

import {
  ArrowUpRight,
  Box,
  GitBranch,
  GitCommitHorizontal,
  Rocket,
  Server,
} from "lucide-react";

import type { Deployment, Metric, Resource } from "@/lib/api/types";

import { DetailItem } from "@/components/DetailItem";
import { RepositoryName } from "@/components/repository-name";
import { SettingsSection } from "@/components/SettingsSection";
import { Empty, StateBadge } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { toastValidationError } from "@/lib/api/toaster";
import { text } from "@/lib/resource-fields";

import { previewCommitSchema } from "../generics";
import { useApprovePreview } from "../hooks";
import { ApplicationContainerMetrics } from "./ApplicationContainerMetrics";

export type ApplicationOverviewProps = {
  app: Resource;
  provider: string;
  server?: Resource;
  latest?: Deployment;
  metrics: { data?: Metric[] };
  setParams: ReturnType<typeof useSearchParams>[1];
};
export function ApplicationOverview({
  app,
  provider,
  server,
  latest,
  metrics,
  setParams,
}: ApplicationOverviewProps) {
  const directCompose = app.data.source === "compose";
  const updateVersion = useApprovePreview({
    refreshAll: true,
    successMessage: "Preview approved and queued",
  });
  function viewDeployment() {
    if (latest) setParams({ deployment: latest.id, tab: "deployments" });
  }
  function approveCommit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = previewCommitSchema.safeParse({ sha: form.get("sha") });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    updateVersion.mutate({ id: app.id, ...parsed.data });
  }
  return (
    <TabsContent value="overview">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <SettingsSection
          title="Latest release"
          description="The most recent deployment and its progress."
          icon={<Rocket />}
          action={latest && <StateBadge state={latest.state} />}
        >
          {latest ? (
            <>
              <div className="flex flex-col gap-5 p-5">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
                  <GitCommitHorizontal className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="text-xs text-muted-foreground">
                      Release commit
                    </p>
                    <p className="break-all font-mono text-sm">
                      {latest.commit ||
                        (directCompose
                          ? "Preparing Compose document…"
                          : "Commit resolving…")}
                    </p>
                  </div>
                </div>
                <dl className="grid gap-5 sm:grid-cols-2">
                  <DetailItem label="Deployment phase">
                    {latest.phase || "Waiting to start"}
                  </DetailItem>
                  <DetailItem label="Created">
                    {new Date(latest.createdAt).toLocaleString()}
                  </DetailItem>
                </dl>
                {latest.error && (
                  <p
                    role="alert"
                    className="break-words rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
                  >
                    {latest.error}
                  </p>
                )}
              </div>
              <div className="flex justify-end border-t bg-muted/10 px-5 py-3">
                <Button variant="outline" size="sm" onClick={viewDeployment}>
                  View deployment
                  <ArrowUpRight />
                </Button>
              </div>
            </>
          ) : (
            <div className="p-5">
              <Empty
                title="Ready when you are"
                description="Deploy your first release to see its status here."
                icon={<Rocket />}
              />
            </div>
          )}
        </SettingsSection>
        <SettingsSection
          title="Deployment configuration"
          description="Where this application is built and deployed."
          icon={<Box />}
        >
          <div className="flex flex-col gap-5 p-5">
            <div className="flex min-w-0 items-start gap-3">
              <Box className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <dl className="min-w-0">
                <DetailItem label="Source">
                  {directCompose ? (
                    "Direct Compose"
                  ) : (
                    <RepositoryName
                      repository={text(app.data, "repository")}
                      provider={provider}
                    />
                  )}
                </DetailItem>
              </dl>
            </div>
            <dl className="grid gap-5 border-t pt-5 sm:grid-cols-2">
              {!directCompose && (
                <DetailItem label="Branch">
                  <span className="inline-flex items-center gap-1.5">
                    <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                    {text(app.data, "branch") || "—"}
                  </span>
                </DetailItem>
              )}
              <DetailItem label="Server">
                <span className="inline-flex items-center gap-1.5">
                  <Server className="size-3.5 shrink-0 text-muted-foreground" />
                  {server?.name || "—"}
                </span>
              </DetailItem>
              <DetailItem label="File">
                <code className="text-xs">
                  {directCompose
                    ? "compose.yaml"
                    : text(app.data, "file") || "—"}
                </code>
              </DetailItem>
              {!directCompose && (
                <DetailItem label="Build context">
                  <code className="text-xs">
                    {text(app.data, "context") || "."}
                  </code>
                </DetailItem>
              )}
            </dl>
          </div>
          {!directCompose && (
            <div className="flex flex-wrap gap-2 border-t bg-muted/10 px-5 py-3">
              <Badge variant={app.data.autoDeploy ? "secondary" : "outline"}>
                Auto deploy {app.data.autoDeploy ? "enabled" : "disabled"}
              </Badge>
              <Badge variant={app.data.previews ? "secondary" : "outline"}>
                PR previews {app.data.previews ? "enabled" : "disabled"}
              </Badge>
            </div>
          )}
        </SettingsSection>
      </div>
      <ApplicationContainerMetrics metrics={metrics.data} />
      {text(app.data, "previewOf") && !text(app.data, "approvedSha") && (
        <div className="mt-5">
          <SettingsSection
            title="Approve fork preview"
            description="Approve an exact commit before deploying this fork preview."
            icon={<GitCommitHorizontal />}
          >
            <form
              className="flex flex-col gap-3 p-5 sm:flex-row"
              onSubmit={approveCommit}
            >
              <Input
                name="sha"
                aria-label="Full commit SHA"
                placeholder="Full commit SHA"
                required
              />
              <Button disabled={!app.canWrite || updateVersion.isPending}>
                Approve commit
              </Button>
            </form>
          </SettingsSection>
        </div>
      )}
    </TabsContent>
  );
}
