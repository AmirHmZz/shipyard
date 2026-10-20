import type { FormEvent } from "react";
import type { useSearchParams } from "react-router";

import { ArrowUpRight } from "lucide-react";

import type { Deployment } from "@/lib/api/types";
import type { Metric, Resource } from "@/lib/api/types";

import { RepositoryName } from "@/components/repository-name";
import { Empty, StateBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { toastValidationError } from "@/lib/api/toaster";
import { text } from "@/lib/resource-fields";

import { previewCommitSchema } from "../generics";
import { useApprovePreview } from "../hooks";

export function ApplicationOverview({
  app,
  provider,
  server,
  latest,
  metrics,
  setParams,
}: {
  app: Resource;
  provider: string;
  server?: Resource;
  latest?: Deployment;
  metrics: { data?: Metric[] };
  setParams: ReturnType<typeof useSearchParams>[1];
}) {
  const directCompose = app.data.source === "compose";
  const containers = metrics.data?.at(-1)?.containers ?? [];
  const updateVersion = useApprovePreview({
    refreshAll: true,
    successMessage: "Preview approved and queued",
  });
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
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Deployment configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              {(directCompose
                ? [
                    ["Source", "Direct Compose"],
                    ["File", "compose.yaml"],
                    ["Server", server?.name || "—"],
                  ]
                : [
                    ["Source", text(app.data, "repository")],
                    ["Branch", text(app.data, "branch")],
                    ["Build context", text(app.data, "context")],
                    ["File", text(app.data, "file")],
                    ["Server", server?.name || "—"],
                    [
                      "Auto deploy",
                      app.data.autoDeploy ? "Enabled" : "Disabled",
                    ],
                    ["PR previews", app.data.previews ? "Enabled" : "Disabled"],
                  ]
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="max-w-[65%] truncate font-mono text-xs">
                    {label === "Source" && !directCompose ? (
                      <RepositoryName repository={value} provider={provider} />
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Latest release</CardTitle>
          </CardHeader>
          <CardContent>
            {latest ? (
              <>
                <StateBadge state={latest.state} />
                <p className="mt-5 font-mono text-xs">
                  {latest.commit ||
                    (directCompose
                      ? "Preparing Compose document…"
                      : "Commit resolving…")}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {latest.phase}
                </p>
                {latest.error && (
                  <p className="mt-3 text-sm text-destructive">
                    {latest.error}
                  </p>
                )}
                <Button
                  variant="outline"
                  className="mt-5"
                  onClick={() => {
                    setParams({
                      deployment: latest.id,
                      tab: "deployments",
                    });
                  }}
                >
                  View deployment
                  <ArrowUpRight />
                </Button>
              </>
            ) : (
              <Empty
                title="Ready when you are"
                description="Deploy your first release to see its status here."
              />
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-5 overflow-hidden pb-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm">Container resources</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sampled every 30 seconds. CPU may exceed 100% across multiple cores.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {containers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Container</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>Memory</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-60 truncate font-mono text-xs">
                      {c.name}
                    </TableCell>
                    <TableCell>{c.cpu.toFixed(1)}%</TableCell>
                    <TableCell>{c.memory.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Container metrics appear after deployment and the next metrics
              poll.
            </p>
          )}
        </CardContent>
      </Card>
      {text(app.data, "previewOf") && !text(app.data, "approvedSha") && (
        <Card className="mt-5 py-0">
          <CardContent className="p-5">
            <p className="mb-3 text-sm">
              This fork preview needs approval for an exact commit.
            </p>
            <form className="flex gap-2" onSubmit={approveCommit}>
              <Input name="sha" placeholder="Full commit SHA" required />
              <Button disabled={!app.canWrite}>Approve commit</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}
