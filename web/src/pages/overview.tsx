import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Layers3,
  Plus,
  Server,
  TerminalSquare,
} from "lucide-react";
import {
  useResources,
  useDeployments,
  ago,
  type Resource,
  text,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResourceEditor } from "@/components/resource-editor";
import {
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  StateBadge,
} from "@/components/shared";
export function DeploymentTable({
  deployments,
  resources,
  onSelect,
}: {
  deployments: ReturnType<typeof useDeployments>["data"];
  resources: Resource[];
  onSelect?: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Application</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Source revision</TableHead>
          <TableHead>Started</TableHead>
          <TableHead className="text-right">Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deployments?.map((d) => (
          <TableRow key={d.id}>
            <TableCell>
              <Link
                to={`/applications/${d.applicationId}`}
                className="flex items-center gap-3 font-medium"
              >
                <div className="flex size-8 items-center justify-center rounded-lg border bg-muted/40">
                  <Box className="size-4 text-muted-foreground" />
                </div>
                {resources.find((r) => r.id === d.applicationId)?.name ||
                  d.applicationId.slice(0, 8)}
              </Link>
            </TableCell>
            <TableCell>
              <StateBadge state={d.state} />
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {d.commit ? (
                <span className="flex items-center gap-1.5">
                  <GitBranch className="size-3" />
                  {d.commit.startsWith("compose:")
                    ? d.commit
                    : d.commit.slice(0, 8)}
                </span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {ago(d.createdAt)}
            </TableCell>
            <TableCell className="text-right">
              {onSelect ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelect(d.id)}
                >
                  Logs
                  <ArrowUpRight className="size-3" />
                </Button>
              ) : (
                <Button variant="ghost" size="icon" asChild>
                  <Link
                    aria-label="View deployment"
                    to={`/applications/${d.applicationId}?deployment=${d.id}`}
                  >
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
export function Overview() {
  const resources = useResources();
  const deployments = useDeployments();
  const [editor, setEditor] = useState("");
  if (resources.isPending) return <Loading />;
  if (resources.error) return <ErrorState error={resources.error} />;
  const rows = resources.data || [];
  const projects = rows.filter((r) => r.kind === "project");
  const apps = rows.filter(
    (r) => r.kind === "application" && !r.data.previewOf,
  );
  const servers = rows.filter((r) => r.kind === "server");
  const previews = rows.filter(
    (r) =>
      r.kind === "application" && r.data.previewOf && !r.data.previewClosed,
  );
  const latest = deployments.data || [];
  const steps = [
    {
      kind: "team",
      label: "Create a team",
      detail: "Give your projects a home.",
    },
    {
      kind: "server",
      label: "Connect a server",
      detail: "A standalone Docker host, over SSH.",
    },
    {
      kind: "git",
      label: "Connect your repository",
      detail: "Bring GitHub or Gitea aboard.",
    },
    {
      kind: "project",
      label: "Create your first project",
      detail: "Organize apps and environments.",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="A clear view of what’s shipping."
        description="Your applications, infrastructure, and latest releases in one place."
      >
        <Button variant="outline" asChild>
          <Link to="/deployments">
            <TerminalSquare />
            Deployment history
          </Link>
        </Button>
        <Button
          disabled={!rows.some((r) => r.kind === "team" && r.canWrite)}
          onClick={() => setEditor("project")}
        >
          <Plus />
          New project
        </Button>
      </PageHeader>
      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Projects",
            count: projects.length,
            icon: Layers3,
            detail: "Organized, from the start",
            path: "/projects",
          },
          {
            title: "Applications",
            count: apps.length,
            icon: Box,
            detail: "Dockerfile & Compose",
            path: "/projects",
          },
          {
            title: "Connected servers",
            count: servers.length,
            icon: Server,
            detail: "Independent Docker hosts",
            path: "/servers",
          },
          {
            title: "Preview environments",
            count: previews.length,
            icon: GitBranch,
            detail: "A space for every pull request",
            path: "/previews",
          },
        ].map((s) => (
          <Link key={s.title} to={s.path}>
            <Card className="gap-0 shadow-none transition-colors hover:border-primary/40">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {s.title}
                </CardTitle>
                <s.icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tracking-tight">
                  {s.count.toString().padStart(2, "0")}
                </div>
                <div className="mt-3 text-[11px] text-muted-foreground">
                  {s.detail}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {!apps.length && (
        <Card className="mb-8 overflow-hidden border-primary/15 bg-gradient-to-br from-primary/8 via-card to-card py-0 shadow-none">
          <CardContent className="grid gap-8 p-7 md:grid-cols-[1fr_1.3fr]">
            <div>
              <Badge
                className="mb-5 border-primary/20 bg-primary/5 font-mono text-[10px] tracking-wider text-primary"
                variant="outline"
              >
                LET’S GET YOU SHIPPING
              </Badge>
              <h2 className="max-w-xs text-2xl leading-tight font-medium tracking-tight">
                Your next release
                <br />
                starts here.
              </h2>
              <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
                Connect your infrastructure, bring a repository, and deploy.
                Shipyard takes care of the route from there.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 text-xs text-primary">
                <span className="size-1.5 rounded-full bg-primary" />
                No clusters to manage.
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {steps.map((s, i) => {
                const done = rows.some((r) => r.kind === s.kind);
                return (
                  <Button
                    key={s.kind}
                    variant="outline"
                    className="h-auto justify-start gap-3 whitespace-normal bg-card/80 p-4 text-left"
                    onClick={() => setEditor(s.kind)}
                  >
                    {done ? (
                      <CheckCircle2 className="size-5 shrink-0 text-primary" />
                    ) : (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                    )}
                    <span>
                      <span className="block text-xs font-medium">
                        {s.label}
                      </span>
                      <span className="mt-1 block text-[11px] leading-5 font-normal text-muted-foreground">
                        {s.detail}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Your projects{" "}
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {projects.length}
          </span>
        </h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/projects">
            View all
            <ArrowRight className="size-3" />
          </Link>
        </Button>
      </div>
      {projects.length ? (
        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.slice(0, 6).map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`}>
              <Card className="gap-0 py-0 shadow-none hover:border-primary/40">
                <CardContent className="p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/50 text-primary">
                      <Layers3 className="size-5" />
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                  <h3 className="text-sm font-medium">{p.name}</h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {
                      rows.filter(
                        (r) => r.kind === "environment" && r.parentId === p.id,
                      ).length
                    }{" "}
                    environments <span className="mx-2">·</span>
                    {
                      rows.filter(
                        (r) =>
                          r.kind === "application" &&
                          r.teamId === p.teamId &&
                          rows.some(
                            (e) => e.id === r.parentId && e.parentId === p.id,
                          ),
                      ).length
                    }{" "}
                    applications
                  </p>
                  <div className="mt-5 flex items-center justify-between border-t pt-4 text-[11px] text-muted-foreground">
                    <span>
                      {rows.find((r) => r.id === p.teamId)?.name ||
                        "Team workspace"}
                    </span>
                    <span>{ago(p.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mb-8">
          <Empty
            title="Room for your next idea"
            description="Projects keep your applications, environments, and team access together."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditor("project")}
              >
                <Plus />
                Create project
              </Button>
            }
          />
        </div>
      )}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between border-b py-5">
          <CardTitle className="text-sm">Recent deployments</CardTitle>
          <Badge variant="outline" className="font-mono text-[10px]">
            LIVE HISTORY
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {deployments.error ? (
            <ErrorState error={deployments.error} />
          ) : latest.length ? (
            <DeploymentTable
              deployments={latest.slice(0, 7)}
              resources={rows}
            />
          ) : (
            <div className="flex min-h-40 items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
              <GitBranch className="size-5" />
              Your first deployment will appear here.
            </div>
          )}
        </CardContent>
      </Card>
      <div className="mt-7 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary" />
        Shipyard control plane{" "}
        <span className="ml-auto font-mono">BUILT TO SHIP</span>
      </div>
      <ResourceEditor
        open={!!editor}
        onOpenChange={(v) => !v && setEditor("")}
        kind={editor}
        resources={rows}
      />
    </>
  );
}
