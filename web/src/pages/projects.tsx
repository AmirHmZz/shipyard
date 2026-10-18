type EditorRequest = { kind: string; existing?: Resource; parentId?: string };
import { DeleteResource, DeletionStatus } from "@/components/delete-resource";
import { ResourceEditor } from "@/components/resource-editor";
import { RepositoryName } from "@/components/repository-name";
import {
  Empty,
  ErrorState,
  Filter,
  Loading,
  PageHeader,
} from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Variables } from "@/components/variables";
import { text, useResources, type Resource } from "@/lib/api";
import { indexResources } from "@/lib/resource-index";
import {
  Box,
  FileCode2,
  GitBranch,
  Layers3,
  MoreHorizontal,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
export function Projects({ previews = false }: { previews?: boolean }) {
  const q = useResources();
  const navigate = useNavigate();
  const index = useMemo(() => indexResources(q.data || []), [q.data]);
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const [filter, setFilter] = useState("");
  const [editor, setEditor] = useState<{
    kind: string;
    existing?: Resource;
    parentId?: string;
  } | null>(null);
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const activeEnvironment = params.get("environment") || "";
  const [variables, setVariables] = useState<Resource | null>(null);
  function openEditor(request: {
    kind: string;
    existing?: Resource;
    parentId?: string;
  }) {
    if (["team", "project", "environment"].includes(request.kind)) {
      setEditor(request);
      return;
    }
    navigate(
      `/configure/${request.kind}/${request.existing?.id || "new"}?parent=${request.parentId || ""}&return=${encodeURIComponent(location.pathname + location.search)}`,
    );
  }
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const resources = q.data || [];
  const project = index.byId.get(id || "");
  const environments = resources.filter(
    (r) => r.kind === "environment" && r.parentId === id,
  );
  const currentEnvironment =
    environments.find((e) => e.id === activeEnvironment) || environments[0];
  const applications = resources.filter(
    (r) =>
      r.kind === "application" &&
      !!r.data.previewOf === previews &&
      !r.data.previewClosed,
  );
  const projects = resources.filter(
    (r) =>
      r.kind === "project" &&
      r.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const cards = (apps: Resource[]) => (
    <ApplicationCards
      apps={apps}
      filter={filter}
      previews={previews}
      index={index}
      currentEnvironment={currentEnvironment}
      openEditor={openEditor}
    />
  );
  return (
    <>
      <ProjectsHeader
        id={id}
        project={project}
        previews={previews}
        environments={environments}
        currentEnvironment={currentEnvironment}
        resources={resources}
        openEditor={openEditor}
      />
      <ProjectToolbar
        id={id}
        project={project}
        filter={filter}
        setFilter={setFilter}
        openEditor={openEditor}
        setDeleting={setDeleting}
      />
      {project && (
        <DeletionStatus
          resource={project}
          onRetry={() => setDeleting(project)}
        />
      )}
      {previews ? (
        cards(applications)
      ) : id ? (
        environments.length ? (
          <Tabs
            value={currentEnvironment?.id}
            onValueChange={(value) =>
              setParams((current) => {
                const next = new URLSearchParams(current);
                next.set("environment", value);
                return next;
              })
            }
          >
            <div className="overflow-x-auto overflow-y-hidden p-1 -m-1">
              <TabsList>
                {environments.map((env) => (
                  <TabsTrigger key={env.id} value={env.id}>
                    <Layers3 aria-hidden="true" />
                    {env.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {environments.map((env) => (
              <TabsContent key={env.id} value={env.id}>
                <div className="mb-4 flex justify-end">
                  <Button
                    disabled={!!env.data.deleting}
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      navigate(
                        `/configure/variables/${env.id}?return=${encodeURIComponent(location.pathname + location.search)}`,
                      )
                    }
                  >
                    Environment variables
                  </Button>
                  <Button
                    disabled={!env.canWrite || !!env.data.deleting}
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      openEditor({ kind: "environment", existing: env })
                    }
                  >
                    Edit environment
                  </Button>
                </div>
                {env.id === currentEnvironment?.id
                  ? cards(applications.filter((app) => app.parentId === env.id))
                  : null}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <Empty
            title="Create an environment"
            description="Start with production or staging. Each environment has its own applications and configuration."
            action={
              <Button
                disabled={!project?.canWrite || !!project?.data.deleting}
                onClick={() =>
                  openEditor({ kind: "environment", parentId: id })
                }
              >
                <Plus />
                New environment
              </Button>
            }
          />
        )
      ) : projects.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card
              key={p.id}
              className="group relative gap-0 py-0 shadow-none transition-colors hover:border-primary/40 focus-within:border-primary/40"
            >
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="rounded-xl border bg-muted/50 p-3">
                    <Layers3 className="size-5 text-primary" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Project actions"
                        className="relative z-10"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        disabled={!p.canWrite || !!p.data.deleting}
                        onClick={() =>
                          openEditor({ kind: "project", existing: p })
                        }
                      >
                        Edit project
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={
                          !p.canWrite ||
                          (!!p.data.deleting && p.data.deletionRoot !== p.id)
                        }
                        onClick={() => setDeleting(p)}
                      >
                        <Trash2 />
                        {p.data.deleting ? "Retry deletion" : "Delete project"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Link
                  className="font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-primary"
                  to={`/projects/${p.id}`}
                >
                  {p.name}
                </Link>
                <p className="mt-2 text-xs text-muted-foreground">
                  {index.byId.get(p.teamId || "")?.name}
                </p>
                {!!p.data.deleting && (
                  <Badge variant="secondary" className="mt-2">
                    {p.data.deletionError ? "Cleanup failed" : "Deleting…"}
                  </Badge>
                )}
                <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                  {
                    (index.byParent.get(p.id) || []).filter(
                      (r) => r.kind === "environment",
                    ).length
                  }{" "}
                  environments
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          title="Everything starts with a project"
          description="Create a team first, then organize your deployments into projects."
          action={
            <Button
              onClick={() =>
                openEditor({
                  kind: resources.some((r) => r.kind === "team")
                    ? "project"
                    : "team",
                })
              }
            >
              <Plus />
              Get started
            </Button>
          }
        />
      )}
      {editor && (
        <ResourceEditor
          open
          onOpenChange={(v) => !v && setEditor(null)}
          kind={editor.kind}
          existing={editor.existing}
          parentId={editor.parentId}
          resources={resources}
        />
      )}
      {deleting && (
        <DeleteResource
          resource={resources.find((r) => r.id === deleting.id) || deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            if (id === deleting.id) navigate("/projects");
          }}
        />
      )}
      <Dialog open={!!variables} onOpenChange={(v) => !v && setVariables(null)}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{variables?.name} variables</DialogTitle>
            <DialogDescription>
              Inherited by applications in this environment. Application
              variables take precedence.
            </DialogDescription>
          </DialogHeader>
          {variables && (
            <Variables
              resource={
                resources.find((r) => r.id === variables.id) || variables
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApplicationCards({
  apps,
  filter,
  previews,
  index,
  currentEnvironment,
  openEditor,
}: {
  apps: Resource[];
  filter: string;
  previews: boolean;
  index: ReturnType<typeof indexResources>;
  currentEnvironment?: Resource;
  openEditor: (request: EditorRequest) => void;
}) {
  return apps.length ? (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {apps
        .filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
        .map((r) => (
          <Link key={r.id} to={`/applications/${r.id}`}>
            <Card className="py-0 shadow-none transition-colors hover:border-primary/40">
              <CardContent className="p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/40">
                    <Box className="size-5 text-primary" />
                  </div>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {text(r.data, "engine").toUpperCase()}
                  </Badge>
                </div>
                <h3 className="font-medium">{r.name}</h3>
                {!!r.data.deleting && (
                  <Badge variant="secondary" className="mt-2">
                    {r.data.deletionError ? "Cleanup failed" : "Deleting…"}
                  </Badge>
                )}
                <p className="mt-2 truncate text-xs text-muted-foreground">
                  {text(r.data, "source") === "compose" ? (
                    "Direct Compose"
                  ) : (
                    <RepositoryName
                      repository={text(r.data, "repository")}
                      provider={text(
                        index.byId.get(text(r.data, "gitId"))?.data || {},
                        "provider",
                      )}
                    />
                  )}
                </p>
                <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {text(r.data, "source") === "compose" ? (
                      <FileCode2 className="size-3" />
                    ) : (
                      <GitBranch className="size-3" />
                    )}
                    {text(r.data, "source") === "compose"
                      ? "compose.yaml"
                      : text(r.data, "branch")}
                  </span>
                  <span>
                    {index.byId.get(text(r.data, "serverId"))?.name || "Server"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
    </div>
  ) : (
    <Empty
      title={
        previews ? "No previews yet" : "This environment is ready for an app"
      }
      description={
        previews
          ? "Enable pull request previews on an application and configure a preview domain on its server."
          : "Deploy from a Git repository or paste Compose YAML directly."
      }
      action={
        !previews && (
          <Button
            disabled={
              !currentEnvironment?.canWrite ||
              !!currentEnvironment?.data.deleting
            }
            onClick={() =>
              openEditor({
                kind: "application",
                parentId: currentEnvironment?.id,
              })
            }
          >
            <Plus />
            New application
          </Button>
        )
      }
    />
  );
}

function ProjectsHeader({
  id,
  project,
  previews,
  environments,
  currentEnvironment,
  resources,
  openEditor,
}: {
  id?: string;
  project?: Resource;
  previews: boolean;
  environments: Resource[];
  currentEnvironment?: Resource;
  resources: Resource[];
  openEditor: (request: EditorRequest) => void;
}) {
  return (
    <PageHeader
      eyebrow="Workspace"
      breadcrumbs={
        id
          ? [
              { label: "Projects", to: "/projects" },
              { label: project?.name || "Project" },
            ]
          : undefined
      }
      title={previews ? "Pull request previews" : project?.name || "Projects"}
      description={
        previews
          ? "Isolated deployments for work in progress. Production secrets stay separate."
          : id
            ? "One project. Separate environments. Clear boundaries."
            : "A home for your applications and the teams that ship them."
      }
    >
      {!previews &&
        (id ? (
          <>
            <Button
              disabled={!project?.canWrite || !!project?.data.deleting}
              variant="outline"
              onClick={() => openEditor({ kind: "environment", parentId: id })}
            >
              <Plus />
              Environment
            </Button>
            <Button
              disabled={
                !project?.canWrite ||
                !!project?.data.deleting ||
                !environments.length
              }
              onClick={() =>
                openEditor({
                  kind: "application",
                  parentId: currentEnvironment?.id,
                })
              }
            >
              <Plus />
              Application
            </Button>
          </>
        ) : (
          <Button
            disabled={!resources.some((r) => r.kind === "team" && r.canWrite)}
            onClick={() => openEditor({ kind: "project" })}
          >
            <Plus />
            New project
          </Button>
        ))}
    </PageHeader>
  );
}

function ProjectToolbar({
  id,
  project,
  filter,
  setFilter,
  openEditor,
  setDeleting,
}: {
  id?: string;
  project?: Resource;
  filter: string;
  setFilter: (value: string) => void;
  openEditor: (request: EditorRequest) => void;
  setDeleting: (resource: Resource) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <Filter value={filter} onChange={setFilter} />
      {id && project && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!project.canWrite || !!project.data.deleting}
            variant="ghost"
            size="sm"
            onClick={() => openEditor({ kind: "project", existing: project })}
          >
            <Settings2 />
            Project settings
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!project.canWrite || !!project.data.deleting}
            onClick={() => setDeleting(project)}
          >
            <Trash2 />
            Delete project
          </Button>
        </div>
      )}
    </div>
  );
}
