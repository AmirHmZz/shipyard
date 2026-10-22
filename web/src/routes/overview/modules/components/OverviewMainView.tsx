import { ArrowRight, Plus, TerminalSquare } from "lucide-react";
import { Link } from "react-router";

import { FlushCard } from "@/components/FlushCard";
import { ResourceEditor } from "@/components/resource-editor";
import { Empty, ErrorState, Loading, PageHeader } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useOverviewPage } from "../hooks";
import { OverviewGettingStarted } from "./OverviewGettingStarted";
import { OverviewProjectCard } from "./OverviewProjectCard";
import { OverviewSummary } from "./OverviewSummary";
import { RecentDeploymentContent } from "./RecentDeploymentContent";
export function OverviewMainView() {
  const { state, derived, handlers } = useOverviewPage();
  const { editor } = state;
  const {
    resources,
    deployments,
    index,
    rows,
    projects,
    apps,
    servers,
    previews,
  } = derived;
  const { openEditor, createProject, handleEditorOpenChange } = handlers;
  if (resources.isPending) return <Loading />;
  if (resources.error) return <ErrorState error={resources.error} />;
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
          onClick={createProject}
        >
          <Plus />
          New project
        </Button>
      </PageHeader>
      <OverviewSummary
        projects={projects.length}
        apps={apps.length}
        servers={servers.length}
        previews={previews.length}
      />
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
            <OverviewProjectCard key={p.id} project={p} index={index} />
          ))}
        </div>
      ) : (
        <div className="mb-8">
          <Empty
            title="Room for your next idea"
            description="Projects keep your applications, environments, and team access together."
            action={
              <Button variant="outline" size="sm" onClick={createProject}>
                <Plus />
                Create project
              </Button>
            }
          />
        </div>
      )}
      <FlushCard>
        <CardHeader className="flex items-center justify-between border-b py-5">
          <CardTitle className="text-sm">Recent deployments</CardTitle>
          <Badge variant="outline" className="font-mono text-[10px]">
            LIVE HISTORY
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <RecentDeploymentContent deployments={deployments} rows={rows} />
        </CardContent>
      </FlushCard>
      <div className="mt-7 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary" />
        Shipyard control plane{" "}
        <span className="ml-auto font-mono">BUILT TO SHIP</span>
      </div>
      <ResourceEditor
        open={!!editor}
        onOpenChange={handleEditorOpenChange}
        kind={editor}
        resources={rows}
      />
    </>
  );
}
