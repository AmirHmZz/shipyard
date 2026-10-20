import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import type { Deployment } from "@/lib/api";

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
import { errorMessage, text, type Metric, type Resource } from "@/lib/api";
import { previewCommitSchema } from "@/lib/validation";

import { updateApplicationVersion } from "../services";

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
  const id = app.id;
  const client = useQueryClient();
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
          {metrics.data?.at(-1)?.containers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Container</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>Memory</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.data.at(-1)!.containers.map((c) => (
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
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                try {
                  await updateApplicationVersion(
                    id,
                    previewCommitSchema.parse({
                      sha: form.get("sha"),
                    }),
                  );
                  toast.success("Preview approved and queued");
                  void client.invalidateQueries();
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Input name="sha" placeholder="Full commit SHA" required />
              <Button disabled={!app.canWrite}>Approve commit</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}
