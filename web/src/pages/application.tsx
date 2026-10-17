import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Box,
  GitBranch,
  FileCode2,
  Pencil,
  RefreshCw,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Server,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  post,
  text,
  number,
  useResources,
  useDeployments,
  errorMessage,
  type Resource,
  type Metric,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfigurationGuard } from "@/components/configuration-surface";
import { Variables } from "@/components/variables";
import { ComposeSource } from "@/components/compose-source";
import { ApplicationNetworking } from "@/components/application-networking";
import { ApplicationPreviews } from "@/components/application-previews";
import { Input } from "@/components/ui/input";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResourceEditor } from "@/components/resource-editor";
import { DeleteResource, DeletionStatus } from "@/components/delete-resource";
import { ContainerTerminal, LogStream } from "@/components/streams";
import {
  Confirm,
  Empty,
  ErrorState,
  ExternalLink,
  Loading,
  PageHeader,
  StateBadge,
} from "@/components/shared";
import { DeploymentTable } from "./overview";
type Runtime = {
  status: string;
  releaseId?: string;
  commit?: string;
  containers?: string[];
  targets?: { port: number; address: string; networkId: string }[];
};
function RouteCard({
  route,
  onEdit,
  onDelete,
}: {
  route: Resource;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const q = useQuery({
    queryKey: ["domain", route.id],
    queryFn: () => api<Record<string, string>>(`/routes/${route.id}/status`),
    refetchInterval: 5000,
  });
  const client = useQueryClient();
  const [replace, setReplace] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const sync = async (mode: string) => {
    setSyncing(true);
    try {
      await post(`/routes/${route.id}/sync`, { mode });
      toast.success("Domain reconciliation queued");
      void client.invalidateQueries({ queryKey: ["domain", route.id] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };
  return (
    <Card className="py-0 shadow-none">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {text(route.data, "protocol") === "grpc"
                ? "gRPC"
                : text(route.data, "protocol") === "tcp"
                  ? "TCP"
                  : "HTTPS"}
            </Badge>
            <span className="break-all font-medium">
              {text(route.data, "domain") ||
                `TCP :${number(route.data, "listenPort")}`}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              → {text(route.data, "service", "app")}:
              {number(route.data, "targetPort")}
            </span>
          </div>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={!route.canWrite || syncing}
                  variant="ghost"
                  size="icon"
                  aria-label="Retry sync"
                  onClick={() => void sync("")}
                >
                  <RefreshCw
                    className={syncing ? "size-4 animate-spin" : "size-4"}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retry sync</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={!route.canWrite}
                  variant="ghost"
                  size="icon"
                  aria-label="Edit route"
                  onClick={onEdit}
                >
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit route</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete route"
              disabled={!route.canWrite}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-4">
          {["dns", "propagation", "certificate", "routing"].map((key) => (
            <div key={key}>
              <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {key}
              </p>
              <StateBadge state={q.data?.[key] || "pending"} />
            </div>
          ))}
        </div>
        {q.data?.error && (
          <Alert className="mt-4" variant="destructive">
            <AlertDescription>{q.data.error}</AlertDescription>
          </Alert>
        )}
        {route.canWrite && q.data?.dns === "conflict" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={syncing}
              variant="outline"
              size="sm"
              onClick={() => void sync("adopt")}
            >
              Adopt matching records
            </Button>
            <Button
              disabled={syncing}
              variant="destructive"
              size="sm"
              onClick={() => setReplace(true)}
            >
              Replace conflicting records
            </Button>
          </div>
        )}
      </CardContent>
      <Confirm
        open={replace}
        onOpenChange={setReplace}
        title="Replace conflicting DNS records?"
        description="Existing A, AAAA and CNAME records for this hostname will be replaced with records pointing at the deployment server."
        destructive
        onConfirm={() => sync("replace")}
      />
    </Card>
  );
}
export function Application() {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const resources = useResources();
  const deployments = useDeployments(id);
  const runtime = useQuery({
    queryKey: ["runtime", id],
    queryFn: () => api<Runtime>(`/applications/${id}/runtime`),
    refetchInterval: 5000,
  });
  const metrics = useQuery({
    queryKey: ["application-metrics", id],
    queryFn: () => api<Metric[]>(`/applications/${id}/metrics`),
    refetchInterval: 30000,
  });
  const releases = useQuery({
    queryKey: ["releases", id],
    queryFn: () =>
      api<
        {
          id: string;
          commit: string;
          createdAt: string;
          images: Record<string, string>;
        }[]
      >(`/applications/${id}/releases`),
    refetchInterval: 10000,
  });
  const tab =
    params.get("tab") ||
    (params.has("deployment") ? "deployments" : "overview");
  const setTab = (value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("tab", value);
      return next;
    });
  const [editor, setEditor] = useState<Resource | "new" | null>(null);
  const [confirmAction, setConfirmAction] = useState("");
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  if (resources.isPending) return <Loading />;
  if (resources.error) return <ErrorState error={resources.error} />;
  const rows = resources.data || [];
  const foundApp = rows.find((r) => r.id === id);
  const app = foundApp && {
    ...foundApp,
    canWrite: foundApp.canWrite && !foundApp.data.deleting,
  };
  if (!app)
    return (
      <Empty
        title="Application not found"
        description="This application may not exist or you may not have access."
      />
    );
  const routes = rows.filter((r) => r.kind === "route" && r.parentId === id);
  const server = rows.find((r) => r.id === text(app.data, "serverId"));
  const environment = rows.find((r) => r.id === app.parentId);
  const project = rows.find((r) => r.id === environment?.parentId);
  const containers = runtime.data?.containers || [];
  const latest = deployments.data?.[0];
  const directCompose = app.data.source === "compose";
  async function deploy() {
    setBusy(true);
    try {
      const d = await post<{ id: string }>(`/applications/${id}/deploy`);
      setParams({ deployment: d.id, tab: "deployments" });
      await client.invalidateQueries({ queryKey: ["deployments"] });
      toast.success("Deployment queued");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string) {
    await post(`/applications/${id}/action`, { action });
    await client.invalidateQueries({ queryKey: ["runtime", id] });
    toast.success(`Application ${action} requested`);
  }
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", to: "/projects" },
          ...(project
            ? [{ label: project.name, to: `/projects/${project.id}` }]
            : []),
          ...(environment && project
            ? [
                {
                  label: environment.name,
                  to: `/projects/${project.id}?environment=${environment.id}`,
                },
              ]
            : []),
          { label: app.name },
        ]}
        title={app.name}
        description={
          directCompose
            ? "Direct Docker Compose deployment"
            : text(app.data, "repository")
        }
      >
        <Button
          variant="outline"
          size="icon"
          aria-label="Restart application"
          disabled={!app.canWrite || !runtime.data?.releaseId}
          onClick={() => setConfirmAction("restart")}
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Stop application"
          disabled={!app.canWrite || !runtime.data?.releaseId}
          onClick={() =>
            setConfirmAction(
              runtime.data?.status === "stopped" ? "start" : "stop",
            )
          }
        >
          {runtime.data?.status === "stopped" ? (
            <Play className="size-4" />
          ) : (
            <Square className="size-4" />
          )}
        </Button>
        <Button
          disabled={!app.canWrite}
          variant="outline"
          onClick={() => setEditor(app)}
        >
          <Settings2 />
          Configure
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete application"
          disabled={!app.canWrite}
          onClick={() => setDeleting(true)}
        >
          <Trash2 className="size-4" />
        </Button>
        <Button
          disabled={
            busy ||
            !app.canWrite ||
            !!app.data.previewClosed ||
            (!!app.data.previewOf && !app.data.approvedSha)
          }
          onClick={() => void deploy()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Play />}Deploy
        </Button>
      </PageHeader>
      <div className="mb-6 flex flex-wrap items-center gap-5 rounded-xl border bg-card px-5 py-4 text-xs">
        <StateBadge state={runtime.data?.status} />
        <span className="flex items-center gap-2 text-muted-foreground">
          {directCompose ? (
            <FileCode2 className="size-3.5" />
          ) : (
            <GitBranch className="size-3.5" />
          )}
          {directCompose ? "Direct Compose" : text(app.data, "branch")}
          <span className="font-mono">
            {directCompose
              ? runtime.data?.commit?.replace("compose:", "")
              : runtime.data?.commit?.slice(0, 8)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <Server className="size-3.5" />
          {server?.name || "Server"}
        </span>
        <Badge variant="outline" className="ml-auto font-mono text-[10px]">
          {text(app.data, "engine").toUpperCase()}
        </Badge>
      </div>
      <DeletionStatus resource={foundApp!} onRetry={() => setDeleting(true)} />
      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-6 overflow-x-auto overflow-y-hidden p-1 -m-1">
          <TabsList>
            {[
              "overview",
              ...(directCompose && app.canWrite ? ["compose"] : []),
              "deployments",
              "domains",
              "variables",
              "networking",
              ...(!directCompose && !app.data.previewOf ? ["previews"] : []),
              "logs",
              "terminal",
            ].map((t) => (
              <TabsTrigger
                disabled={t === "terminal" && !app.canWrite}
                key={t}
                value={t}
                className="capitalize"
              >
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {directCompose && app.canWrite && (
          <TabsContent value="compose">
            <ConfigurationGuard className="max-w-none">
              <ComposeSource
                key={app.id}
                app={app}
                onDeploy={(deployment) => {
                  setParams({ deployment, tab: "deployments" });
                  void client.invalidateQueries({ queryKey: ["deployments"] });
                }}
              />
            </ConfigurationGuard>
          </TabsContent>
        )}
        <TabsContent value="overview">
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">
                  Deployment configuration
                </CardTitle>
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
                        [
                          "PR previews",
                          app.data.previews ? "Enabled" : "Disabled",
                        ],
                      ]
                  ).map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="max-w-[65%] truncate font-mono text-xs">
                        {value}
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
                Sampled every 30 seconds. CPU may exceed 100% across multiple
                cores.
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
                      await post(`/applications/${id}/approve-preview`, {
                        sha: form.get("sha"),
                      });
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
        <TabsContent value="deployments">
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            {deployments.data?.length ? (
              <DeploymentTable
                resources={rows}
                deployments={deployments.data}
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
                        onClick={() =>
                          setConfirmAction("rollback:" + release.id)
                        }
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
        <TabsContent value="domains">
          <div className="mb-5 flex justify-end">
            <Button disabled={!app.canWrite} onClick={() => setEditor("new")}>
              <Plus />
              Add route
            </Button>
          </div>
          <div className="space-y-4">
            {routes.length ? (
              routes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={{ ...route, canWrite: route.canWrite && app.canWrite }}
                  onEdit={() => setEditor(route)}
                  onDelete={() => setConfirmAction("delete:" + route.id)}
                />
              ))
            ) : (
              <Empty
                title="Give your application an address"
                description="Add a domain or a TCP listener. Managed zones create DNS records and obtain certificates automatically."
              />
            )}
          </div>
        </TabsContent>
        <TabsContent value="variables">
          <ConfigurationGuard className="max-w-none">
            <Variables resource={app} />
          </ConfigurationGuard>
        </TabsContent>
        <TabsContent value="networking">
          <ConfigurationGuard className="max-w-none">
            <ApplicationNetworking key={app.id} app={app} />
          </ConfigurationGuard>
        </TabsContent>
        <TabsContent value="previews">
          <ConfigurationGuard>
            <ApplicationPreviews key={app.id} app={app} />
          </ConfigurationGuard>
        </TabsContent>
        <TabsContent value="logs">
          {containers.length ? (
            <LogStream applicationId={id} containers={containers} />
          ) : (
            <Empty
              title="No running containers"
              description="Deploy this application before opening its logs."
            />
          )}
        </TabsContent>
        <TabsContent value="terminal">
          {app.canWrite && containers.length ? (
            <ContainerTerminal applicationId={id} containers={containers} />
          ) : (
            <Empty
              title="No running containers"
              description="A container terminal is available after deployment."
            />
          )}
        </TabsContent>
      </Tabs>
      <Confirm
        open={!!confirmAction}
        onOpenChange={(v) => !v && setConfirmAction("")}
        title={
          confirmAction.startsWith("rollback:")
            ? "Roll back this application?"
            : confirmAction.startsWith("delete:")
              ? "Remove this route?"
              : `${confirmAction} application?`
        }
        description={
          confirmAction.startsWith("delete:")
            ? "Shipyard will remove its own DNS records when no other routes use them."
            : confirmAction.startsWith("rollback:")
              ? "The selected release’s images and configuration will be restored. Application data will not be changed."
              : "This operation affects the application containers."
        }
        destructive={
          confirmAction === "stop" || confirmAction.startsWith("delete:")
        }
        onConfirm={async () => {
          if (confirmAction.startsWith("rollback:")) {
            const d = await post<{ id: string }>(
              `/applications/${id}/rollback`,
              { releaseId: confirmAction.split(":")[1] },
            );
            setParams({ deployment: d.id, tab: "deployments" });
          } else if (confirmAction.startsWith("delete:")) {
            await api(`/resources/${confirmAction.split(":")[1]}`, {
              method: "DELETE",
              body: "{}",
            });
            await client.invalidateQueries({ queryKey: ["resources"] });
          } else await act(confirmAction);
        }}
      />
      {editor && (
        <ResourceEditor
          open
          onOpenChange={(v) => !v && setEditor(null)}
          kind={editor === "new" ? "route" : editor.kind}
          resources={rows}
          existing={editor === "new" ? undefined : editor}
          parentId={editor === "new" ? id : undefined}
        />
      )}
      {deleting && (
        <DeleteResource
          resource={foundApp!}
          onClose={() => setDeleting(false)}
          onDeleted={() =>
            navigate(project ? `/projects/${project.id}` : "/projects")
          }
        />
      )}
    </>
  );
}
