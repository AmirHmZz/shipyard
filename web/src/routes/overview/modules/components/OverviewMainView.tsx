import {
  ArrowRight,
  Box,
  ChevronRight,
  GitBranch,
  Layers3,
  Plus,
  Server,
  TerminalSquare,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

import { DeploymentTable } from "@/components/deployment-table";
import { ResourceEditor } from "@/components/resource-editor";
import { Empty, ErrorState, Loading, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ago, useDeployments, useResources } from "@/lib/api";
import { indexResources } from "@/lib/resource-index";

import { OverviewGettingStarted } from "./OverviewGettingStarted";

export function OverviewMainView() {
  const resources = useResources();
  const deployments = useDeployments();
  const index = useMemo(
    () => indexResources(resources.data || []),
    [resources.data],
  );
  const [editor, setEditor] = useState("");
  const navigate = useNavigate();
  const openEditor = (kind: string) =>
    ["team", "project", "environment"].includes(kind)
      ? setEditor(kind)
      : navigate(`/configure/${kind}/new?return=/`);
  if (resources.isPending) return <Loading />;
  if (resources.error) return <ErrorState error={resources.error} />;
  const rows = resources.data || [];
  const projects = index.byKind.get("project") || [];
  const apps = (index.byKind.get("application") || []).filter(
    (r) => !r.data.previewOf,
  );
  const servers = index.byKind.get("server") || [];
  const previews = (index.byKind.get("application") || []).filter(
    (r) =>
      r.kind === "application" && r.data.previewOf && !r.data.previewClosed,
  );
  const latest = deployments.data || [];
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
          onClick={() => openEditor("project")}
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
        <OverviewGettingStarted rows={rows} openEditor={openEditor} />
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
                      (index.byParent.get(p.id) || []).filter(
                        (r) => r.kind === "environment",
                      ).length
                    }{" "}
                    environments <span className="mx-2">·</span>
                    {
                      (index.byKind.get("application") || []).filter(
                        (r) =>
                          r.teamId === p.teamId &&
                          index.byId.get(r.parentId || "")?.parentId === p.id,
                      ).length
                    }{" "}
                    applications
                  </p>
                  <div className="mt-5 flex items-center justify-between border-t pt-4 text-[11px] text-muted-foreground">
                    <span>
                      {index.byId.get(p.teamId || "")?.name || "Team workspace"}
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
                onClick={() => openEditor("project")}
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
