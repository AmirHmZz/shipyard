import {
  ConfigurationGuard,
  ConfigurationPage,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/configuration-surface";
import { Grants } from "@/components/grants";
import { ProviderLogo, ProviderName } from "@/components/provider-name";
import {
  Confirm,
  Empty,
  ErrorState,
  Filter,
  Loading,
  PageHeader,
  StateBadge,
} from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ZoneCertificates } from "@/components/zone-certificates";
import {
  api,
  errorMessage,
  post,
  text,
  useAccount,
  useAdmin,
  useResources,
  type DNSRecord,
  type Metric,
  type Resource,
} from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { providerName } from "@/lib/providers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Check,
  Cloud,
  GitBranch,
  Globe2,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";
const ServerCPUChart = lazy(() => import("@/components/server-cpu-chart"));
function ServerCard({
  server,
  onEdit,
  onGrants,
  onHAProxy,
  onDelete,
}: {
  server: Resource;
  onEdit: () => void;
  onGrants: () => void;
  onHAProxy: () => void;
  onDelete: () => void;
}) {
  const admin = useAdmin();
  const q = useQuery({
    queryKey: ["metrics", server.id],
    queryFn: () => api<Metric[]>(`/servers/${server.id}/metrics`),
    refetchInterval: 30000,
  });
  const latest = q.data?.at(-1);
  const client = useQueryClient();
  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl border bg-muted/50">
            <Server className="size-5 text-primary" />
          </div>
          <CardTitle className="text-base">{server.name}</CardTitle>
          <CardDescription className="mt-2 font-mono text-xs">
            {server.data.connection === "local"
              ? "Local Docker host"
              : `${text(server.data, "user")}@${text(server.data, "host")} · SSH`}
          </CardDescription>
        </div>
        <StateBadge
          state={latest ? (latest.online ? "online" : "offline") : "pending"}
        />
      </CardHeader>
      <CardContent>
        {server.data.deleting ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {server.data.deletionError
                ? text(server.data, "deletionError")
                : "Server cleanup in progress."}
            </p>
            {admin && (
              <Button variant="outline" size="sm" onClick={onDelete}>
                {server.data.deletionError
                  ? "Retry cleanup"
                  : "Cleanup details"}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-3 gap-3">
              {[
                ["CPU", latest?.cpu],
                ["Memory", latest?.memory],
                ["Disk", latest?.disk],
              ].map(([label, v]) => (
                <div key={label}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-2 font-mono text-lg">
                    {typeof v === "number" ? `${v.toFixed(1)}%` : "—"}
                  </p>
                </div>
              ))}
            </div>
            {q.data && q.data.length > 1 ? (
              <div className="mb-5 h-20">
                <Suspense
                  fallback={
                    <div className="h-full animate-pulse rounded bg-muted" />
                  }
                >
                  <ServerCPUChart data={q.data} />
                </Suspense>
              </div>
            ) : (
              <p className="mb-5 text-xs text-muted-foreground">
                Metrics appear after the next 30-second poll.
              </p>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button
                disabled={!server.canWrite}
                variant="outline"
                size="sm"
                onClick={onEdit}
              >
                Configure
              </Button>
              <Button
                disabled={!server.canWrite}
                variant="outline"
                size="sm"
                onClick={onGrants}
              >
                <Users />
                Team access
              </Button>
              {server.canWrite && (
                <Button variant="outline" size="sm" onClick={onHAProxy}>
                  <Settings2 className="size-4" /> HAProxy settings
                </Button>
              )}
              <Button
                disabled={!server.canWrite}
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    const v = await post<{ dockerVersion: string }>(
                      `/servers/${server.id}/test`,
                    );
                    toast.success(`Connected · Docker ${v.dockerVersion}`);
                    void client.invalidateQueries({ queryKey: ["metrics"] });
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                <Check />
                Test
              </Button>
              {admin && server.data.connection !== "local" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 />
                  Delete server
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
export function Servers() {
  const navigate = useNavigate();
  const account = useAccount();
  const q = useResources();
  const openServer = (server?: Resource) =>
    navigate(`/configure/server/${server?.id || "new"}?return=/servers`);
  const [grants, setGrants] = useState<Resource | null>(null);
  const [provision, setProvision] = useState<Resource | null>(null);
  const [filter, setFilter] = useState("");
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const resources = q.data || [];
  const servers = resources.filter(
    (r) =>
      r.kind === "server" &&
      r.name.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        title="Servers"
        description="Independent Docker hosts, connected securely over SSH. No cluster required."
      >
        <Button disabled={!account?.admin} onClick={() => openServer()}>
          <Plus />
          Connect server
        </Button>
      </PageHeader>
      <div className="mb-6">
        <Filter value={filter} onChange={setFilter} />
      </div>
      {servers.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {servers.map((server) => (
            <div key={server.id}>
              <ServerCard
                server={server}
                onEdit={() => openServer(server)}
                onGrants={() =>
                  navigate(`/configure/access/${server.id}?return=/servers`)
                }
                onHAProxy={() =>
                  navigate(`/configure/haproxy/${server.id}?return=/servers`)
                }
                onDelete={() => navigate(`/servers/${server.id}/delete`)}
              />
              {server.data.connection !== "local" && !server.data.deleting && (
                <Button
                  className="mt-2"
                  disabled={!server.canWrite}
                  variant="ghost"
                  size="sm"
                  onClick={() => setProvision(server)}
                >
                  <Wrench />
                  Provision missing prerequisites
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Connect your first server"
          description="Add a Linux host, verify its SSH fingerprint, then let Shipyard prepare Docker and HAProxy."
          icon={<Server />}
          action={
            <Button disabled={!account?.admin} onClick={() => openServer()}>
              <Plus />
              Connect server
            </Button>
          }
        />
      )}
      <Dialog open={!!grants} onOpenChange={(v) => !v && setGrants(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Team access · {grants?.name}</DialogTitle>
            <DialogDescription>
              Infrastructure stays private until explicitly granted.
            </DialogDescription>
          </DialogHeader>
          {grants && <Grants resource={grants} resources={resources} />}
        </DialogContent>
      </Dialog>
      <Confirm
        open={!!provision}
        onOpenChange={(v) => !v && setProvision(null)}
        title="Prepare this server?"
        description="Shipyard will use root SSH access to install missing Docker/Compose prerequisites and create its managed directories on this Debian/Ubuntu server."
        onConfirm={async () => {
          await post(`/servers/${provision?.id}/provision`);
          toast.success("Provisioning queued. Track it in Settings → Jobs.");
        }}
      />
    </>
  );
}
export function Integrations() {
  const navigate = useNavigate();
  const account = useAccount();
  const q = useResources();
  const openEditor = (request: { kind: string; resource?: Resource }) =>
    navigate(
      `/configure/${request.kind}/${request.resource?.id || "new"}?return=/integrations`,
    );
  const [grant, setGrant] = useState<Resource | null>(null);
  const openGit = (resource?: Resource) =>
    navigate(
      `/configure/source-control/${resource?.id || "new"}?return=/integrations`,
    );
  const [params] = useSearchParams();
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const resources = q.data || [];
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Integrations"
        description="Connect the services between your repository and your domain."
      />
      <div className="space-y-6">
        {[
          {
            kind: "git",
            title: "Source control",
            desc: "GitHub Apps and self-hosted Gitea.",
            icon: GitBranch,
          },
          {
            kind: "dns",
            title: "DNS providers",
            desc: "Cloudflare and ArvanCloud.",
            icon: Cloud,
          },
          {
            kind: "webhook",
            title: "Notification webhooks",
            desc: "Signed events to your preferred service.",
            icon: Activity,
          },
        ].map((item) => (
          <section key={item.kind} aria-labelledby={`integration-${item.kind}`}>
            <Card className="gap-0 overflow-hidden pb-0 shadow-none">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 pb-5">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/50">
                    <item.icon className="size-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle
                      id={`integration-${item.kind}`}
                      className="text-base"
                    >
                      {item.title}
                    </CardTitle>
                    <CardDescription>{item.desc}</CardDescription>
                  </div>
                </div>
                <Button
                  disabled={
                    !account?.admin &&
                    !(
                      item.kind === "webhook" &&
                      resources.some((r) => r.kind === "team" && r.canWrite)
                    )
                  }
                  variant="outline"
                  onClick={() =>
                    item.kind === "git"
                      ? openGit()
                      : openEditor({ kind: item.kind })
                  }
                >
                  <Plus />
                  Add connection
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {!resources.some((r) => r.kind === item.kind) && (
                  <p className="border-t px-6 py-5 text-sm text-muted-foreground">
                    No {item.title.toLowerCase()} connections yet.
                  </p>
                )}
                <div>
                  {resources
                    .filter((r) => r.kind === item.kind)
                    .map((resource) => (
                      <div
                        key={resource.id}
                        className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-5"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="shrink-0 rounded-lg border bg-muted/50 p-2.5">
                            {resource.kind === "git" ||
                            resource.kind === "dns" ? (
                              <ProviderLogo
                                provider={text(resource.data, "provider")}
                                className="size-5"
                              />
                            ) : (
                              <Activity className="size-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium">
                              {resource.name}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {text(resource.data, "provider")
                                ? providerName(text(resource.data, "provider"))
                                : text(resource.data, "url")}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {resource.kind === "git" && (
                            <Button
                              disabled={!resource.canWrite}
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                navigate(
                                  `/configure/access/${resource.id}?return=/integrations`,
                                )
                              }
                            >
                              <Users />
                              Team access
                            </Button>
                          )}
                          <Button
                            disabled={!resource.canWrite}
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              resource.kind === "git"
                                ? openGit(resource)
                                : openEditor({ kind: resource.kind, resource })
                            }
                          >
                            Configure
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </section>
        ))}
      </div>
      <Alert className="mt-6">
        <ShieldCheck className="size-4" />
        <AlertDescription>
          GitHub Apps need repository Contents and Pull requests read
          permissions, plus push/pull_request webhooks. Gitea OAuth connections
          use read-only access; configure Gitea webhooks manually.
        </AlertDescription>
      </Alert>
      {(params.get("gitError") || params.get("gitConnected")) && (
        <Alert
          className="mt-4"
          variant={params.get("gitError") ? "destructive" : "default"}
        >
          <AlertDescription>
            {params.get("gitError") ||
              "Git connection authorized. Grant team access and, for Gitea, configure your repository webhook."}
          </AlertDescription>
        </Alert>
      )}
      <Dialog open={!!grant} onOpenChange={(v) => !v && setGrant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Team access</DialogTitle>
            <DialogDescription>
              Assign this connection to trusted teams.
            </DialogDescription>
          </DialogHeader>
          {grant && <Grants resource={grant} resources={resources} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
function DNSRecordSurface({ zone }: { zone: Resource }) {
  const { record } = useParams();
  return record ? (
    <ConfigurationPage>
      <ConfigurationGuard key={zone.id + record}>
        <DNSRecords key={record} zone={zone} />
      </ConfigurationGuard>
    </ConfigurationPage>
  ) : (
    <DNSRecords key={zone.id} zone={zone} />
  );
}
function DNSRecords({ zone }: { zone: Resource }) {
  const changes = useConfigurationChanges();
  const { record: recordId } = useParams();
  const initializedRecord = useRef("");
  const navigate = useNavigate();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ["records", zone.id],
    queryFn: () => api<DNSRecord[]>(`/zones/${zone.id}/records`),
  });
  const [edit, setEdit] = useState<DNSRecord | null>(null);
  const [extra, setExtra] = useState("");
  useEffect(() => {
    if (!recordId || initializedRecord.current === recordId) return;
    const record =
      recordId === "new"
        ? {
            type: "A",
            name: String(zone.data.domain),
            content: "",
            ttl: 120,
            proxied: false,
          }
        : q.data?.find((r) => r.id === recordId);
    if (record) {
      initializedRecord.current = recordId;
      setEdit(record);
      setExtra(record.data ? JSON.stringify(record.data, null, 2) : "");
    }
  }, [recordId, q.data, zone.data.domain]);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      const data = extra.trim() ? JSON.parse(extra) : undefined;
      await api(`/zones/${zone.id}/records${edit.id ? `/${edit.id}` : ""}`, {
        method: edit.id ? "PUT" : "POST",
        body: JSON.stringify({ ...edit, data }),
      });
      await client.invalidateQueries({ queryKey: ["records", zone.id] });
      setEdit(null);
      changes.saved();
      navigate(`/dns/${zone.id}`);
      toast.success("DNS record saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!recordId && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              {q.isFetching ? <Spinner className="size-4" /> : <RefreshCw />}
              Refresh records
            </Button>
            <Button
              disabled={!zone.canWrite}
              onClick={() => {
                setEdit({
                  type: "A",
                  name: text(zone.data, "domain"),
                  content: "",
                  ttl: 120,
                  proxied: false,
                });
                setExtra("");
                navigate(`/dns/${zone.id}/records/new`);
              }}
            >
              <Plus />
              Add record
            </Button>
          </div>
          {q.isPending ? (
            <Loading />
          ) : q.error ? (
            <ErrorState error={q.error} />
          ) : (
            <Card className="gap-0 overflow-hidden py-0 shadow-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>TTL</TableHead>
                    <TableHead>Proxy</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data?.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {record.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{record.name}</TableCell>
                      <TableCell className="max-w-64 truncate font-mono text-xs">
                        {record.content || JSON.stringify(record.data)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {record.ttl === 1 ? "Auto" : record.ttl}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {record.proxied ? "Proxied" : "DNS only"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          disabled={!zone.canWrite}
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEdit(record);
                            navigate(`/dns/${zone.id}/records/${record.id}`);
                            setExtra(
                              record.data
                                ? JSON.stringify(record.data, null, 2)
                                : "",
                            );
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          disabled={!zone.canWrite}
                          variant="ghost"
                          size="icon"
                          aria-label="Delete DNS record"
                          onClick={() => setDeleteId(record.id || "")}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!q.data?.length && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No records in this zone.
                </div>
              )}
            </Card>
          )}
        </>
      )}
      <Dialog
        open={!!edit}
        onOpenChange={(v) => {
          if (!v) {
            setEdit(null);
            navigate(`/dns/${zone.id}`);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit" : "New"} DNS record</DialogTitle>
            <DialogDescription>
              Provider-specific values are preserved when editing an existing
              record.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <Label>Type</Label>
              <Select
                value={edit.type}
                onValueChange={(v) => setEdit({ ...edit, type: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"].map(
                    (t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Input
                  value={edit.content}
                  onChange={(e) =>
                    setEdit({ ...edit, content: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>TTL (1 = automatic)</Label>
                  <Input
                    type="number"
                    value={edit.ttl}
                    onChange={(e) =>
                      setEdit({ ...edit, ttl: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Input
                    type="number"
                    value={edit.priority ?? ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        priority: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Provider proxy enabled</Label>
                <Switch
                  checked={edit.proxied}
                  onCheckedChange={(v) => setEdit({ ...edit, proxied: v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Provider value / structured data (JSON)</Label>
                <Textarea
                  className="font-mono text-xs"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use this for SRV/CAA and ArvanCloud multi-value records.
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/dns/${zone.id}`)}
                >
                  Cancel
                </Button>
                <Button disabled={busy}>Save record</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Confirm
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId("")}
        title="Delete this DNS record?"
        description="This removes the record from your DNS provider."
        destructive
        onConfirm={async () => {
          await api(`/zones/${zone.id}/records/${deleteId}`, {
            method: "DELETE",
            body: "{}",
          });
          await client.invalidateQueries({ queryKey: ["records", zone.id] });
        }}
      />
    </>
  );
}
export function DNS() {
  const account = useAccount();
  const q = useResources();
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const [grant, setGrant] = useState(false);
  const client = useQueryClient();
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const resources = q.data || [];
  const byId = new Map(resources.map((r) => [r.id, r]));
  const zones = resources.filter((r) => r.kind === "zone");
  const zone = zones.find((z) => z.id === id);
  const visible = zones.filter((z) =>
    `${text(z.data, "domain")} ${z.name}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  if (id && !zone)
    return (
      <Empty
        title="Domain not found"
        description="This domain may not exist or you may not have access."
        action={
          <Button asChild variant="outline">
            <Link to="/dns">Back to domains</Link>
          </Button>
        }
      />
    );
  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        breadcrumbs={
          zone
            ? [
                { label: "DNS & domains", to: "/dns" },
                { label: text(zone.data, "domain") },
              ]
            : undefined
        }
        title={zone ? text(zone.data, "domain") : "DNS & domains"}
        description={
          zone
            ? "Manage DNS records, certificates, and team access for this domain."
            : "Manage your Cloudflare and ArvanCloud domains, records, and certificates."
        }
      >
        {zone ? (
          <Button
            disabled={!zone.canWrite}
            variant="outline"
            onClick={() =>
              navigate(`/configure/access/${zone!.id}?return=/dns/${zone!.id}`)
            }
          >
            <Users /> Team access
          </Button>
        ) : (
          <Button
            disabled={!account?.admin}
            variant="outline"
            onClick={() => navigate("/configure/zone/new?return=/dns")}
          >
            <Plus />
            Add zone
          </Button>
        )}
      </PageHeader>
      {!zone && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Filter
            value={filter}
            onChange={setFilter}
            placeholder="Filter domains…"
          />
        </div>
      )}
      {zone ? (
        <Tabs
          value={
            params.get("tab") === "certificates" ? "certificates" : "records"
          }
          onValueChange={(value) =>
            setParams(value === "records" ? {} : { tab: value })
          }
        >
          <TabsList>
            <TabsTrigger value="records">
              <Globe2 aria-hidden="true" />
              DNS records
            </TabsTrigger>
            <TabsTrigger value="certificates">
              <ShieldCheck aria-hidden="true" />
              Certificates
            </TabsTrigger>
          </TabsList>
          <TabsContent value="records">
            <DNSRecordSurface zone={zone} />
          </TabsContent>
          <TabsContent value="certificates">
            <ZoneCertificates key={zone.id} zone={zone} resources={resources} />
          </TabsContent>
        </Tabs>
      ) : zones.length ? (
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>
                  <span className="sr-only">Manage</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length ? (
                visible.map((z) => {
                  const connection = byId.get(z.parentId || "");
                  return (
                    <TableRow key={z.id} className="relative">
                      <TableCell>
                        <Link
                          className="font-medium hover:text-primary after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                          to={`/dns/${z.id}`}
                        >
                          {text(z.data, "domain")}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {z.name}
                        </p>
                      </TableCell>
                      <TableCell>
                        {connection ? (
                          <ProviderName
                            provider={text(connection.data, "provider")}
                          />
                        ) : (
                          "Managed provider"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {connection?.name || "Team connection"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(z.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <ArrowRight
                          className="ml-auto size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No domains match your filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Empty
          title="Connect a DNS zone"
          description="Add a provider in Integrations, import an existing zone, and grant it to your team."
          icon={<Globe2 />}
        />
      )}
      <Dialog open={grant} onOpenChange={setGrant}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zone access</DialogTitle>
            <DialogDescription>
              Team owners can edit records in granted zones.
            </DialogDescription>
          </DialogHeader>
          {zone && <Grants resource={zone} resources={resources} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
