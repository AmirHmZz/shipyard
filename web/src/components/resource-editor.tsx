import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Fingerprint, RefreshCw, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, post, errorMessage, type Resource } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/configuration-surface";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ProviderName, ProviderLogo } from "@/components/provider-name";
const ComposeEditor = lazy(() => import("./compose-code-editor"));
type Field = {
  key: string;
  label: string;
  type?:
    "number" | "switch" | "secret" | "password" | "textarea" | "json" | "csv";
  options?: string[];
  resource?: string;
  help?: string;
};
const fields: Record<string, Field[]> = {
  team: [],
  project: [],
  environment: [],
  server: [
    { key: "host", label: "SSH hostname / IP" },
    { key: "port", label: "SSH port", type: "number" },
    { key: "user", label: "SSH user" },
    {
      key: "authMethod",
      label: "SSH authentication",
      options: ["private_key", "password"],
      help: "Private keys are recommended. Passwords are encrypted and never returned.",
    },
    {
      key: "fingerprint",
      label: "Verified host fingerprint",
      help: "Compare the SHA256 fingerprint with a trusted source before saving.",
    },
    { key: "private_key", label: "SSH private key", type: "secret" },
    { key: "password", label: "SSH password", type: "password" },
    { key: "ipv4", label: "Public IPv4" },
    { key: "ipv6", label: "Public IPv6 (optional)" },
  ],
  git: [
    { key: "provider", label: "Provider", options: ["github", "gitea"] },
    {
      key: "url",
      label: "Gitea instance URL",
      help: "HTTPS URL, for example https://git.example.com",
    },
    { key: "appId", label: "GitHub App ID" },
    { key: "installationId", label: "GitHub installation ID" },
    { key: "private_key", label: "GitHub App private key", type: "secret" },
    { key: "token", label: "Gitea API token", type: "secret" },
    {
      key: "webhook_secret",
      label: "Webhook signing secret",
      type: "secret",
      help: "Use the same secret in your GitHub App / Gitea webhook configuration.",
    },
  ],
  dns: [
    {
      key: "provider",
      label: "DNS provider",
      options: ["cloudflare", "arvancloud"],
    },
    { key: "token", label: "Provider API token", type: "secret" },
  ],
  zone: [],
  application: [
    { key: "source", label: "Source", options: ["git", "compose"] },
    {
      key: "engine",
      label: "Deployment type",
      options: ["dockerfile", "compose"],
    },
    { key: "serverId", label: "Target server", resource: "server" },
    { key: "gitId", label: "Git connection", resource: "git" },
    {
      key: "repository",
      label: "Repository",
      help: "Choose a repository below or enter owner/name.",
    },
    { key: "branch", label: "Branch" },
    {
      key: "context",
      label: "Build context",
      help: "Path relative to repository root.",
    },
    {
      key: "file",
      label: "Dockerfile / Compose file",
      help: "Path relative to repository root.",
    },
    { key: "port", label: "Application port (0 for workers)", type: "number" },
    {
      key: "worker",
      label: "Background worker (recreate deployment)",
      type: "switch",
    },
    { key: "healthPath", label: "HTTP readiness path (optional)" },
    {
      key: "healthTimeout",
      label: "Readiness deadline (seconds)",
      type: "number",
    },
    { key: "autoDeploy", label: "Deploy on branch pushes", type: "switch" },
    { key: "previews", label: "Pull request previews", type: "switch" },
    {
      key: "previewDomain",
      label: "Preview wildcard domain",
      help: "For example *.preview.example.com",
    },
    { key: "previewZoneId", label: "Preview domain zone", resource: "zone" },
    { key: "profiles", label: "Compose profiles", type: "csv" },
    {
      key: "buildArgs",
      label: "Build arguments (JSON)",
      type: "json",
      help: "Use build secrets for credentials; build arguments can appear in image metadata.",
    },
    { key: "registry", label: "Private registry (optional)" },
    { key: "registryUser", label: "Registry username" },
    {
      key: "registry_password",
      label: "Registry password / token",
      type: "secret",
    },
  ],
  route: [
    { key: "protocol", label: "Protocol", options: ["https", "grpc", "tcp"] },

    {
      key: "service",
      label: "Compose service name",
      help: "Use app for Dockerfile deployments.",
    },
    { key: "targetPort", label: "Container port", type: "number" },
    {
      key: "tls",
      label: "TLS mode",
      options: ["terminate", "passthrough"],
    },

    { key: "listenPort", label: "Public TCP port (TCP only)", type: "number" },
  ],
  webhook: [
    { key: "url", label: "Webhook HTTPS URL" },
    {
      key: "events",
      label: "Events (comma-separated; empty for all)",
      type: "csv",
    },
    {
      key: "signing_secret",
      label: "Signing secret (optional)",
      type: "secret",
    },
  ],
};
const defaults: Record<string, Record<string, unknown>> = {
  server: { port: 22, user: "root", authMethod: "private_key" },
  git: { provider: "github" },
  dns: { provider: "cloudflare" },
  application: {
    source: "git",
    engine: "dockerfile",
    branch: "main",
    context: ".",
    file: "Dockerfile",
    port: 3000,
    healthTimeout: 120,
    profiles: [],
    buildArgs: {},
  },
  route: {
    protocol: "https",
    service: "app",
    targetPort: 3000,
    tls: "terminate",

    listenPort: 9000,
  },
};
const parents: Record<string, string> = {
  project: "team",
  environment: "project",
  application: "environment",
  route: "application",
  zone: "dns",
};
export function ResourceEditor({
  open,
  onOpenChange,
  kind,
  resources,
  existing,
  parentId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (s: boolean) => void;
  kind: string;
  resources: Resource[];
  existing?: Resource;
  parentId?: string;
  onSaved?: (r: Resource) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const page = location.pathname.startsWith("/configure/");
  const longForm = [
    "application",
    "server",
    "zone",
    "route",
    "git",
    "dns",
    "webhook",
  ].includes(kind);
  useEffect(() => {
    if (open && longForm && !page) {
      navigate(
        "/configure/" +
          kind +
          "/" +
          (existing?.id || "new") +
          "?parent=" +
          (parentId || "") +
          "&return=" +
          encodeURIComponent(location.pathname + location.search),
      );
      onOpenChange(false);
    }
  }, [open, page, kind, existing?.id, parentId]);
  const [runtimeVariables, setRuntimeVariables] = useState("");
  const formId = useId();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [team, setTeam] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [probe, setProbe] = useState(false);
  const [composeYAML, setComposeYAML] = useState("");
  const needsComposeDocument =
    kind === "application" &&
    data.source === "compose" &&
    existing?.data.source !== "compose";
  const parentKind = parents[kind];
  const parentLabel =
    parentKind === "dns"
      ? "DNS provider"
      : parentKind
        ? parentKind[0].toUpperCase() + parentKind.slice(1)
        : "";
  const parentOptions = resources
    .filter((r) => r.kind === parentKind)
    .map((r) => ({
      value: r.id,
      label:
        kind === "zone" ? (
          <span className="flex items-center gap-2">
            <ProviderLogo provider={String(r.data.provider)} />
            {r.name}
          </span>
        ) : (
          r.name
        ),
    }));
  useEffect(() => {
    if (open) {
      setName(existing?.name || "");
      setParent(existing?.parentId || parentId || "");
      setTeam(existing?.teamId || "");
      const initial = { ...defaults[kind], ...existing?.data };
      if (kind === "route") {
        delete initial.path;
        delete initial.stripPrefix;
      }
      setData(initial);
      setSecrets({});
      setVersion(existing?.version || 0);
      setError("");
      setComposeYAML("");
    }
  }, [open, existing?.id, kind, parentId]);
  const availableZones = useQuery({
    queryKey: ["provider-zones", parent],
    queryFn: () =>
      api<{ id: string; name: string }[]>("/dns/" + parent + "/zones"),
    enabled: open && kind === "zone" && !!parent,
    retry: false,
  });
  const services = useQuery({
    queryKey: ["application-services", parent],
    queryFn: () =>
      api<{ name: string; ignoredPorts: boolean }[]>(
        "/applications/" + parent + "/services",
      ),
    enabled: open && kind === "route" && !!parent,
    retry: false,
  });
  const gitId = String(data.gitId || "");
  const repository = String(data.repository || "");
  const repos = useQuery({
    queryKey: ["repositories", gitId],
    queryFn: () => api<{ full_name: string }[]>(`/git/${gitId}/repositories`),
    enabled:
      open && kind === "application" && data.source !== "compose" && !!gitId,
    retry: false,
  });
  const branches = useQuery({
    queryKey: ["branches", gitId, repository],
    queryFn: () =>
      api<{ name: string }[]>(
        `/git/${gitId}/branches?repository=${encodeURIComponent(repository)}`,
      ),
    enabled:
      open &&
      kind === "application" &&
      data.source !== "compose" &&
      !!gitId &&
      !!repository,
    retry: false,
  });
  const update = (key: string, value: unknown) => {
    if (kind === "application" && key === "source" && value === "compose") {
      setData((d) => ({
        ...d,
        source: "compose",
        engine: "compose",
        gitId: "",
        repository: "",
        branch: "",
        context: ".",
        file: "compose.yaml",
        autoDeploy: false,
        previews: false,
        port: 0,
      }));
      return;
    }
    if (kind === "server" && key === "authMethod") setSecrets({});
    setData((d) => ({
      ...d,
      [key]: value,
      ...(key === "engine"
        ? { file: value === "compose" ? "compose.yaml" : "Dockerfile" }
        : {}),
    }));
  };
  const selectableZones = (availableZones.data || []).filter(
    (z) =>
      !resources.some(
        (r) =>
          r.kind === "zone" &&
          r.parentId === parent &&
          r.data.providerZoneId === z.id &&
          r.id !== existing?.id,
      ),
  );
  const choose = (
    value: string,
    onValue: (v: string) => void,
    options: { value: string; label: ReactNode }[],
    placeholder: string,
    disabled = false,
    id?: string,
  ) => (
    <Select
      value={value || undefined}
      onValueChange={onValue}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  async function save() {
    if (kind === "zone" && !parent) {
      setError("Select a DNS provider before saving the zone.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const resolved = { ...data };
      const writeSecrets = { ...secrets };
      if (kind === "route") {
        delete resolved.backendTls;
        delete resolved.backendServerName;
        delete resolved.redirect;
        if (resolved.protocol !== "tcp") resolved.tls = "terminate";
        const zone = resources.find((r) => r.id === resolved.zoneId);
        if (!zone) throw Error("Select a connected zone");
        const base = String(zone.data.domain);
        const value = String(resolved.domain || "");
        resolved.domain =
          value === base || value.endsWith("." + base)
            ? value
            : value
              ? value + "." + base
              : base;
      }
      if (kind === "application") {
        for (const line of runtimeVariables.split(/\r?\n/)) {
          if (!line.trim() || line.trim().startsWith("#")) continue;
          const index = line.indexOf("=");
          if (index < 1) throw Error("Use KEY=value for runtime variables");
          writeSecrets["env:" + line.slice(0, index).trim()] = line.slice(
            index + 1,
          );
        }
      }
      for (const f of fields[kind] || []) {
        if (f.type === "json" && typeof resolved[f.key] === "string")
          resolved[f.key] = JSON.parse(String(resolved[f.key] || "{}"));
        if (f.type === "csv" && typeof resolved[f.key] === "string")
          resolved[f.key] = String(resolved[f.key])
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
      }
      const resource = await api<Resource>(
        existing ? `/resources/${existing.id}` : "/resources",
        {
          method: existing ? "PUT" : "POST",
          body: JSON.stringify({
            kind,
            name: kind === "zone" ? String(resolved.domain || "zone") : name,
            parentId: parent,
            teamId: team,
            data: resolved,
            secrets: needsComposeDocument
              ? { ...writeSecrets, compose: composeYAML }
              : writeSecrets,
            version,
          }),
        },
      );
      await client.invalidateQueries({ queryKey: ["resources"] });
      window.dispatchEvent(new Event("configuration-saved"));
      toast.success(`${kind[0].toUpperCase() + kind.slice(1)} saved`);
      onOpenChange(false);
      onSaved?.(resource);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (open && longForm && !page) return null;
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={`max-h-[90vh] overflow-y-auto ${kind === "application" && data.source === "compose" ? "sm:max-w-3xl" : "sm:max-w-xl"}`}
        >
          <DialogHeader>
            <DialogTitle>
              {existing ? "Edit" : "New"}{" "}
              {kind === "git"
                ? "Git connection"
                : kind === "dns"
                  ? "DNS provider"
                  : kind}
            </DialogTitle>
            <DialogDescription>
              {existing
                ? "Changes take effect on the next deployment unless they update a route."
                : "Configure a resource in your deployment workspace."}{" "}
              Credentials are encrypted and never returned.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="space-y-5"
          >
            {kind !== "zone" && (
              <div className="space-y-2">
                <Label htmlFor={`${formId}-name`}>Name</Label>
                <Input
                  id={`${formId}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  placeholder={
                    kind === "project"
                      ? "e.g. Customer platform"
                      : kind === "server"
                        ? "e.g. Production · Frankfurt"
                        : "A descriptive name"
                  }
                />
              </div>
            )}
            {parentKind && (
              <div className="space-y-2">
                <Label htmlFor={`${formId}-parent`}>{parentLabel}</Label>
                {choose(
                  parent,
                  (value) => {
                    setParent(value);
                    if (kind === "zone") setData({});
                  },
                  parentOptions,
                  kind === "zone"
                    ? "Select DNS provider"
                    : `Select ${parentKind}`,
                  !!existing || (kind === "zone" && !parentOptions.length),
                  `${formId}-parent`,
                )}
              </div>
            )}
            {kind === "zone" && (
              <section className="space-y-3">
                <Label>Available domain</Label>
                {!parentOptions.length && (
                  <p>
                    No DNS providers connected. Configure a provider under
                    Integrations first.
                  </p>
                )}
                {availableZones.isFetching ? (
                  <p className="text-muted-foreground">
                    Loading provider domains…
                  </p>
                ) : availableZones.error ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {errorMessage(availableZones.error)}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void availableZones.refetch()}
                      >
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  choose(
                    String(data.providerZoneId || ""),
                    (id) => {
                      const zone = availableZones.data?.find(
                        (z) => z.id === id,
                      );
                      if (zone)
                        setData({ domain: zone.name, providerZoneId: zone.id });
                    },
                    selectableZones.map((z) => ({
                      value: z.id,
                      label: z.name,
                    })),
                    "Select available domain",
                    !parent || !selectableZones.length,
                  )
                )}
                {!!parent &&
                  !availableZones.isFetching &&
                  !availableZones.error &&
                  !availableZones.data?.length && (
                    <p>No domains available from this provider.</p>
                  )}
                {!!parent &&
                  !!availableZones.data?.length &&
                  !selectableZones.length && (
                    <p>All domains from this provider are already connected.</p>
                  )}
                <p className="text-sm text-muted-foreground">
                  Already connected domains are excluded. DNS providers are
                  configured under Integrations.
                </p>
              </section>
            )}
            {kind === "route" && (
              <section className="space-y-4">
                <div className="space-y-2">
                  <Label>Connected zone</Label>
                  {choose(
                    String(data.zoneId || ""),
                    (value) => update("zoneId", value),
                    resources
                      .filter((r) => r.kind === "zone")
                      .map((r) => ({
                        value: r.id,
                        label: String(r.data.domain),
                      })),
                    "Select connected zone",
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="route-subdomain">
                    Subdomain or full hostname
                  </Label>
                  <Input
                    id="route-subdomain"
                    value={String(data.domain || "")}
                    onChange={(e) => update("domain", e.target.value)}
                    placeholder="api, *.apps, or leave empty for the apex"
                  />
                </div>
                {services.error && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {errorMessage(services.error)}
                      <Button
                        type="button"
                        onClick={() => void services.refetch()}
                      >
                        Retry service discovery
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </section>
            )}
            {kind === "webhook" && (
              <div className="space-y-2">
                <Label>Team (optional for platform-wide alerts)</Label>
                {choose(
                  team,
                  setTeam,
                  resources
                    .filter((r) => r.kind === "team")
                    .map((r) => ({
                      value: r.id,
                      label: r.kind === "zone" ? String(r.data.domain) : r.name,
                    })),
                  "Platform-wide",
                )}
              </div>
            )}
            <Separator />
            {kind === "server" && data.connection === "local" && (
              <Alert>
                <AlertDescription>
                  Local Docker access is managed by the installation. No SSH
                  credentials or provisioning are needed.
                </AlertDescription>
              </Alert>
            )}
            {(fields[kind] || [])
              .filter(
                (f) =>
                  !(
                    kind === "server" &&
                    data.connection === "local" &&
                    [
                      "host",
                      "port",
                      "user",
                      "fingerprint",
                      "authMethod",
                      "private_key",
                      "password",
                    ].includes(f.key)
                  ),
              )
              .filter(
                (f) =>
                  !(
                    kind === "application" &&
                    ["previewDomain", "previewZoneId"].includes(f.key) &&
                    !data.previews
                  ),
              )
              .filter(
                (f) =>
                  !(
                    kind === "application" &&
                    data.source === "compose" &&
                    [
                      "engine",
                      "gitId",
                      "repository",
                      "branch",
                      "context",
                      "file",
                      "autoDeploy",
                      "previews",
                      "previewDomain",
                      "previewZoneId",
                      "port",
                      "worker",
                      "healthPath",
                    ].includes(f.key)
                  ),
              )
              .filter(
                (f) =>
                  !(
                    kind === "server" &&
                    ((f.key === "private_key" &&
                      data.authMethod === "password") ||
                      (f.key === "password" && data.authMethod !== "password"))
                  ),
              )
              .filter(
                (f) =>
                  !(
                    kind === "git" &&
                    (data.provider === "github"
                      ? ["url", "token"].includes(f.key)
                      : ["appId", "installationId", "private_key"].includes(
                          f.key,
                        ))
                  ),
              )
              .filter(
                (f) =>
                  !(
                    kind === "route" &&
                    (data.protocol === "tcp"
                      ? false
                      : ["listenPort", "tls"].includes(f.key))
                  ),
              )
              .map((f) => (
                <div key={f.key} className="space-y-2">
                  {kind === "application" &&
                    (
                      {
                        source: "Source",
                        healthTimeout: "Readiness",
                        previews: "Pull request previews",
                        profiles: "Build and registry",
                      } as Record<string, string>
                    )[f.key] && (
                      <h2 className="mt-8 border-t pt-6 text-lg font-semibold">
                        {
                          (
                            {
                              source: "Source",
                              healthTimeout: "Readiness",
                              previews: "Pull request previews",
                              profiles: "Build and registry",
                            } as Record<string, string>
                          )[f.key]
                        }
                      </h2>
                    )}
                  {f.type === "switch" ? (
                    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                      <Label htmlFor={`${formId}-${f.key}`}>{f.label}</Label>
                      <Switch
                        id={`${formId}-${f.key}`}
                        checked={!!data[f.key]}
                        onCheckedChange={(v) => update(f.key, v)}
                      />
                    </div>
                  ) : (
                    <>
                      <Label htmlFor={`${formId}-${f.key}`}>{f.label}</Label>
                      {f.type === "password" ? (
                        <Input
                          id={`${formId}-${f.key}`}
                          type="password"
                          autoComplete="new-password"
                          value={secrets[f.key] || ""}
                          onChange={(e) =>
                            setSecrets((s) => ({
                              ...s,
                              [f.key]: e.target.value,
                            }))
                          }
                          placeholder={
                            existing?.secretKeys.includes(f.key)
                              ? "Stored securely. Leave untouched to retain."
                              : "Enter SSH password"
                          }
                        />
                      ) : f.type === "secret" ? (
                        <Textarea
                          id={`${formId}-${f.key}`}
                          className="min-h-20 font-mono text-xs"
                          value={secrets[f.key] || ""}
                          onChange={(e) =>
                            setSecrets((s) => ({
                              ...s,
                              [f.key]: e.target.value,
                            }))
                          }
                          placeholder={
                            existing?.secretKeys.includes(f.key)
                              ? "Stored securely. Leave untouched to retain."
                              : "Paste credential"
                          }
                        />
                      ) : kind === "route" && f.key === "service" ? (
                        choose(
                          String(data.service || ""),
                          (v) => update("service", v),
                          (services.data || []).map((s) => ({
                            value: s.name,
                            label: s.name,
                          })),
                          services.isFetching
                            ? "Loading services…"
                            : "Select Compose service",
                          !services.data?.length,
                          `${formId}-${f.key}`,
                        )
                      ) : f.options ? (
                        choose(
                          String(data[f.key] || ""),
                          (v) => update(f.key, v),
                          f.options.map((v) => ({
                            value: v,
                            label:
                              f.key === "protocol" ? (
                                { https: "HTTPS", grpc: "gRPC", tcp: "TCP" }[
                                  v
                                ] || v
                              ) : f.key === "tls" ? (
                                v === "terminate" ? (
                                  "TLS termination"
                                ) : (
                                  "TLS passthrough"
                                )
                              ) : f.key === "source" ? (
                                v === "compose" ? (
                                  "Direct Compose"
                                ) : (
                                  "Git repository"
                                )
                              ) : f.key === "authMethod" ? (
                                v === "private_key" ? (
                                  "Private key (recommended)"
                                ) : (
                                  "Password"
                                )
                              ) : f.key === "provider" ? (
                                <ProviderName provider={v} />
                              ) : (
                                v
                              ),
                          })),
                          `Select ${f.label}`,
                          false,
                          `${formId}-${f.key}`,
                        )
                      ) : f.resource ? (
                        choose(
                          String(data[f.key] || ""),
                          (v) => update(f.key, v),
                          resources
                            .filter((r) => r.kind === f.resource)
                            .map((r) => ({ value: r.id, label: r.name })),
                          `Select ${f.resource}`,
                          false,
                          `${formId}-${f.key}`,
                        )
                      ) : f.type === "json" ? (
                        <Textarea
                          id={`${formId}-${f.key}`}
                          className="font-mono text-xs"
                          value={
                            typeof data[f.key] === "string"
                              ? String(data[f.key])
                              : JSON.stringify(data[f.key] || {}, null, 2)
                          }
                          onChange={(e) => update(f.key, e.target.value)}
                        />
                      ) : (
                        <Input
                          id={`${formId}-${f.key}`}
                          type={f.type === "number" ? "number" : "text"}
                          value={
                            Array.isArray(data[f.key])
                              ? (data[f.key] as string[]).join(", ")
                              : String(data[f.key] ?? "")
                          }
                          onChange={(e) =>
                            update(
                              f.key,
                              f.type === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                            )
                          }
                        />
                      )}
                    </>
                  )}
                  {f.help && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {f.help}
                    </p>
                  )}
                  {kind === "server" && f.key === "fingerprint" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={probe || !data.host}
                      onClick={async () => {
                        setProbe(true);
                        try {
                          const value = await post<{ fingerprint: string }>(
                            "/servers/fingerprint",
                            { host: data.host, port: data.port || 22 },
                          );
                          update("fingerprint", value.fingerprint);
                        } catch (e) {
                          toast.error(errorMessage(e));
                        } finally {
                          setProbe(false);
                        }
                      }}
                    >
                      {probe ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Fingerprint />
                      )}
                      Probe fingerprint
                    </Button>
                  )}
                  {kind === "application" &&
                    f.key === "repository" &&
                    gitId && (
                      <>
                        {repos.isFetching ? (
                          <p className="text-xs text-muted-foreground">
                            Loading repositories…
                          </p>
                        ) : repos.isError ? (
                          <p className="text-xs text-destructive">
                            {errorMessage(repos.error)}
                          </p>
                        ) : (
                          repos.data &&
                          choose(
                            repository,
                            (v) => update("repository", v),
                            repos.data.map((v) => ({
                              value: v.full_name,
                              label: v.full_name,
                            })),
                            "Browse provider repositories",
                          )
                        )}
                      </>
                    )}
                  {kind === "application" &&
                    f.key === "branch" &&
                    branches.data &&
                    choose(
                      String(data.branch || ""),
                      (v) => update("branch", v),
                      branches.data.map((v) => ({
                        value: v.name,
                        label: v.name,
                      })),
                      "Browse branches",
                    )}
                  {f.key === "webhook_secret" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSecrets((s) => ({
                          ...s,
                          webhook_secret: Array.from(
                            crypto.getRandomValues(new Uint8Array(32)),
                            (n) => n.toString(16).padStart(2, "0"),
                          ).join(""),
                        }))
                      }
                    >
                      <RefreshCw />
                      Generate signing secret
                    </Button>
                  )}
                </div>
              ))}
            {kind === "application" &&
              data.source === "compose" &&
              existing?.data.source === "compose" && (
                <section className="space-y-3 border-t pt-5">
                  <p className="text-sm text-muted-foreground">
                    Manage the saved Docker Compose document in the
                    application's Compose tab.
                  </p>
                  <Button variant="outline" asChild>
                    <Link to={`/applications/${existing.id}?tab=compose`}>
                      Open Compose editor
                    </Link>
                  </Button>
                </section>
              )}
            {needsComposeDocument && (
              <section
                className="min-w-0 space-y-2"
                aria-label="Direct Compose source"
              >
                <Label>Compose YAML</Label>
                <p className="text-xs text-muted-foreground">
                  Paste one Compose document. Use images or dockerfile_inline
                  builds; referenced host files need absolute paths. The
                  document is encrypted and visible only to operators.
                </p>
                <Suspense fallback={<p>Loading editor…</p>}>
                  <ComposeEditor
                    value={composeYAML}
                    onChange={(yaml) => {
                      window.dispatchEvent(new Event("configuration-dirty"));
                      setComposeYAML(yaml);
                    }}
                    disabled={busy}
                  />
                </Suspense>
              </section>
            )}
            {kind === "application" && !existing && (
              <section className="space-y-2 border-t pt-5">
                <Label htmlFor="new-app-variables">
                  Application runtime variables (KEY=value)
                </Label>
                <Textarea
                  id="new-app-variables"
                  className="min-h-32 font-mono"
                  value={runtimeVariables}
                  onChange={(e) => setRuntimeVariables(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Encrypted and write-only. These override inherited environment
                  values.
                </p>
              </section>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (kind !== "zone" && !name) ||
                  (kind === "zone" && !data.providerZoneId) ||
                  (kind === "zone" && !parent) ||
                  (needsComposeDocument && !composeYAML.trim())
                }
              >
                {busy && <Loader2 className="animate-spin" />}Save{" "}
                {kind === "git"
                  ? "connection"
                  : kind === "dns"
                    ? "provider"
                    : kind}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
