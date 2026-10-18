import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/configuration-surface";
import { ProviderLogo, ProviderName } from "@/components/provider-name";
import { RepositoryName } from "@/components/repository-name";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { loadComposeEditor } from "@/lib/feature-loaders";
import { Fingerprint, RefreshCw } from "lucide-react";
import type * as React from "react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ResourceFormProvider,
  useResourceForm,
  type ResourceFormProps,
} from "./resource-forms/controller";
import {
  fields,
  type Field,
  type ResourceKind,
} from "./resource-forms/definitions";
import type { Options } from "./resource-forms/options";
import { ResourceOptions } from "./resource-forms/options";
import { ErrorState, Loading } from "./shared";
const COMPOSE_HIDDEN_FIELDS = new Set([
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
]);
const ComposeEditor = lazy(loadComposeEditor);
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
function ResourceFormView({
  open,
  onOpenChange,
  kind,
  resources,
  existing,
}: ResourceFormProps & { kind: ResourceKind }) {
  const {
    state: {
      name,
      parent,
      project,
      team,
      data,
      secrets,
      busy,
      error,
      dnsTesting,
      dnsVerified,
      composeYAML,
    },
    actions: {
      setName,
      setParent,
      setProject,
      setTeam,
      setData,
      setComposeYAML,
      save,
      testDNS,
      change,
    },
    meta: {
      formId,
      parentKind,
      parentLabel,
      parentOptions,
      needsDNSTest,
      needsComposeDocument,
    },
  } = useResourceForm();
  return (
    <ResourceOptions kind={kind} parent={parent} data={data} open={open}>
      {({ availableZones, services, repos, branches }) => {
        const registeredZones = new Set(
          resources
            .filter(
              (r) =>
                r.kind === "zone" &&
                r.parentId === parent &&
                r.id !== existing?.id,
            )
            .map((r) => r.data.providerZoneId),
        );
        const selectableZones = (availableZones.data || []).filter(
          (z) => !registeredZones.has(z.id),
        );
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
                  {kind !== "zone" && kind !== "route" && (
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
                  {kind === "application" && !existing && (
                    <div className="space-y-2">
                      <Label htmlFor={`${formId}-project`}>Project</Label>
                      {choose(
                        project,
                        setProject,
                        resources
                          .filter((r) => r.kind === "project")
                          .map((r) => ({ value: r.id, label: r.name })),
                        "Select project",
                        false,
                        `${formId}-project`,
                      )}
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
                        !!existing ||
                          (kind === "zone" && !parentOptions.length) ||
                          (kind === "application" && !parentOptions.length),
                        `${formId}-parent`,
                      )}
                    </div>
                  )}
                  {kind === "zone" && (
                    <ZoneFields
                      availableZones={availableZones}
                      selectableZones={selectableZones}
                    />
                  )}
                  {kind === "route" && (
                    <RouteFields resources={resources} services={services} />
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
                            label:
                              r.kind === "zone"
                                ? String(r.data.domain)
                                : r.name,
                          })),
                        "Platform-wide",
                      )}
                    </div>
                  )}
                  <Separator />
                  {kind === "server" && data.connection === "local" && (
                    <Alert>
                      <AlertDescription>
                        Local Docker access is managed by the installation. No
                        SSH credentials or provisioning are needed.
                      </AlertDescription>
                    </Alert>
                  )}
                  <ResourceSchemaFields
                    kind={kind}
                    resources={resources}
                    existing={existing}
                    services={services}
                    repos={repos}
                    branches={branches}
                  />
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
                        Paste one Compose document. Use images or
                        dockerfile_inline builds; referenced host files need
                        absolute paths. The document is encrypted and visible
                        only to operators.
                      </p>
                      <Suspense fallback={<p>Loading editor…</p>}>
                        <ComposeEditor
                          value={composeYAML}
                          onChange={(yaml) => {
                            change();
                            setComposeYAML(yaml);
                          }}
                          disabled={busy}
                        />
                      </Suspense>
                    </section>
                  )}
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {needsDNSTest && (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={dnsTesting || busy || !secrets.token?.trim()}
                        onClick={() => void testDNS()}
                      >
                        {dnsTesting && <Spinner className="size-4 " />}
                        {dnsTesting ? "Testing provider…" : "Test provider"}
                      </Button>
                      <p
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        {dnsVerified
                          ? "Connection verified. Provider is ready to save."
                          : "Test your API token before saving this provider."}
                      </p>
                    </div>
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
                        (kind !== "zone" && kind !== "route" && !name) ||
                        (needsDNSTest && (!dnsVerified || dnsTesting)) ||
                        (kind === "zone" && !data.providerZoneId) ||
                        (kind === "zone" && !parent) ||
                        (needsComposeDocument && !composeYAML.trim())
                      }
                    >
                      {busy && <Spinner className="size-4 " />}Save{" "}
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
      }}
    </ResourceOptions>
  );
}

function TeamForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="team">
      <ResourceFormView {...props} kind="team" />
    </ResourceFormProvider>
  );
}
function ProjectForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="project">
      <ResourceFormView {...props} kind="project" />
    </ResourceFormProvider>
  );
}
function EnvironmentForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="environment">
      <ResourceFormView {...props} kind="environment" />
    </ResourceFormProvider>
  );
}
function ServerForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="server">
      <ResourceFormView {...props} kind="server" />
    </ResourceFormProvider>
  );
}
function GitForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="git">
      <ResourceFormView {...props} kind="git" />
    </ResourceFormProvider>
  );
}
function DnsForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="dns">
      <ResourceFormView {...props} kind="dns" />
    </ResourceFormProvider>
  );
}
function ZoneForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="zone">
      <ResourceFormView {...props} kind="zone" />
    </ResourceFormProvider>
  );
}
function ApplicationForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="application">
      <ResourceFormView {...props} kind="application" />
    </ResourceFormProvider>
  );
}
function RouteForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="route">
      <ResourceFormView {...props} kind="route" />
    </ResourceFormProvider>
  );
}
function WebhookForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="webhook">
      <ResourceFormView {...props} kind="webhook" />
    </ResourceFormProvider>
  );
}
const forms = {
  team: TeamForm,
  project: ProjectForm,
  environment: EnvironmentForm,
  server: ServerForm,
  git: GitForm,
  dns: DnsForm,
  zone: ZoneForm,
  application: ApplicationForm,
  route: RouteForm,
  webhook: WebhookForm,
};
export function ResourceForm({
  kind,
  ...props
}: ResourceFormProps & { kind: string }) {
  if (!Object.hasOwn(forms, kind))
    return <ErrorState error={new Error("Unsupported resource kind")} />;
  if (props.existing && props.existing.kind !== kind)
    return (
      <ErrorState
        error={new Error("Resource kind does not match the requested form")}
      />
    );
  const Form = forms[kind as ResourceKind];
  return <Form {...props} />;
}
export function ResourceEditor(props: ResourceFormProps & { kind: string }) {
  if (!props.open) return null;
  return (
    <ResourceForm
      key={
        props.kind +
        ":" +
        (props.existing?.id || "new") +
        ":" +
        (props.parentId || "")
      }
      {...props}
    />
  );
}

function ResourceField({
  kind,
  resources,
  existing,
  services,
  repos,
  branches,
  f,
}: {
  kind: ResourceKind;
  resources: ResourceFormProps["resources"];
  existing?: ResourceFormProps["existing"];
  services: Options["services"];
  repos: Options["repos"];
  branches: Options["branches"];
  f: Field;
}) {
  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();

  return (
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
          <Label htmlFor={`${formId}-${f.key}`}>
            {kind === "application" && f.key === "file"
              ? data.engine === "compose"
                ? "Compose file"
                : "Dockerfile"
              : f.label}
          </Label>
          <Switch
            id={`${formId}-${f.key}`}
            checked={!!data[f.key]}
            onCheckedChange={(v) => update(f.key, v)}
          />
        </div>
      ) : (
        <>
          <Label htmlFor={`${formId}-${f.key}`}>
            {kind === "application" && f.key === "file"
              ? data.engine === "compose"
                ? "Compose file"
                : "Dockerfile"
              : f.label}
          </Label>
          <ResourceFieldControl
            kind={kind}
            resources={resources}
            existing={existing}
            services={services}
            repos={repos}
            branches={branches}
            f={f}
          />
        </>
      )}
      {f.help && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {f.help}
        </p>
      )}
      <ResourceFieldActions
        kind={kind}
        f={f}
        repos={repos}
        branches={branches}
      />
    </div>
  );
}

function ResourceSchemaFields({
  kind,
  resources,
  existing,
  services,
  repos,
  branches,
}: Omit<Parameters<typeof ResourceField>[0], "f">) {
  const {
    state: { data },
  } = useResourceForm();
  return (
    <>
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
              COMPOSE_HIDDEN_FIELDS.has(f.key)
            ),
        )
        .filter(
          (f) =>
            !(
              kind === "server" &&
              ((f.key === "private_key" && data.authMethod === "password") ||
                (f.key === "password" && data.authMethod !== "password"))
            ),
        )
        .filter(
          (f) =>
            !(
              kind === "git" &&
              (data.provider === "github"
                ? ["url", "token"].includes(f.key)
                : ["appId", "installationId", "private_key"].includes(f.key))
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
          <ResourceField
            key={f.key}
            kind={kind}
            resources={resources}
            existing={existing}
            services={services}
            repos={repos}
            branches={branches}
            f={f}
          />
        ))}
    </>
  );
}

function ResourceFieldControl(props: Parameters<typeof ResourceField>[0]) {
  const { kind, f } = props;
  if (kind === "application" && f.key === "repository")
    return <RepositoryField {...props} />;
  if (kind === "application" && f.key === "branch")
    return <BranchField {...props} />;
  return <StandardResourceFieldControl {...props} />;
}

function StandardResourceFieldControl(
  props: Parameters<typeof ResourceField>[0],
) {
  const { kind, services, f } = props;

  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();
  if (f.type === "password" || f.type === "secret")
    return <SecretResourceField {...props} />;
  if (kind === "route" && f.key === "service")
    return choose(
      String(data.service || ""),
      (v) => update("service", v),
      (services.data || []).map((s) => ({
        value: s.name,
        label: s.name,
      })),
      services.isFetching ? "Loading services…" : "Select Compose service",
      !services.data?.length,
      `${formId}-${f.key}`,
    );
  if (f.options || f.resource) return <ResourceFieldSelect {...props} />;
  return <ScalarResourceField {...props} />;
}

function ResourceFieldSelect(props: Parameters<typeof ResourceField>[0]) {
  const { resources, f } = props;
  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();
  if (f.options)
    return choose(
      String(data[f.key] || ""),
      (v) => update(f.key, v),
      f.options.map((v) => ({
        value: v,
        label:
          f.key === "protocol" ? (
            {
              https: "HTTPS",
              grpc: "gRPC",
              tcp: "TCP",
            }[v] || v
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
    );
  if (f.resource)
    return choose(
      String(data[f.key] || ""),
      (v) => update(f.key, v),
      resources
        .filter((r) => r.kind === f.resource)
        .map((r) => ({
          value: r.id,
          label:
            f.resource === "git" ? (
              <span className="inline-flex min-w-0 items-center gap-2">
                <ProviderLogo provider={String(r.data.provider || "")} />
                <span className="truncate">{r.name}</span>
              </span>
            ) : (
              r.name
            ),
        })),
      `Select ${f.resource}`,
      false,
      `${formId}-${f.key}`,
    );
  return null;
}

function ZoneFields({
  availableZones,
  selectableZones,
}: {
  availableZones: Options["availableZones"];
  selectableZones: { id: string; name: string }[];
}) {
  const {
    state: { data, parent },
    actions: { setData },
    meta: { parentOptions },
  } = useResourceForm();
  return (
    <section className="space-y-3">
      <Label>Available domain</Label>
      {!parentOptions.length && (
        <p>
          No DNS providers connected. Configure a provider under Integrations
          first.
        </p>
      )}
      {availableZones.isFetching ? (
        <p className="text-muted-foreground">Loading provider domains…</p>
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
            const zone = availableZones.data?.find((z) => z.id === id);
            if (zone)
              setData({
                domain: zone.name,
                providerZoneId: zone.id,
              });
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
      {!!parent && !!availableZones.data?.length && !selectableZones.length && (
        <p>All domains from this provider are already connected.</p>
      )}
      <p className="text-sm text-muted-foreground">
        Already connected domains are excluded. DNS providers are configured
        under Integrations.
      </p>
    </section>
  );
}

function RouteFields({
  resources,
  services,
}: {
  resources: ResourceFormProps["resources"];
  services: Options["services"];
}) {
  const {
    state: { data },
    actions: { update },
  } = useResourceForm();
  const zone = resources.find((r) => r.id === data.zoneId && r.kind === "zone");
  return (
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
        <Label htmlFor="route-subdomain">Subdomain</Label>
        <InputGroup>
          <InputGroupInput
            id="route-subdomain"
            value={String(data.domain || "")}
            onChange={(e) => update("domain", e.target.value)}
            disabled={!zone}
            placeholder="api or *.apps"
          />
          {zone && (
            <InputGroupAddon align="inline-end">
              <InputGroupText>.{String(zone.data.domain)}</InputGroupText>
            </InputGroupAddon>
          )}
        </InputGroup>
        <p className="text-xs text-muted-foreground">
          Leave blank for the zone itself.
        </p>
      </div>
      {services.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {errorMessage(services.error)}
            <Button type="button" onClick={() => void services.refetch()}>
              Retry service discovery
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

function ResourceFieldActions({
  kind,
  f,
}: Pick<
  Parameters<typeof ResourceField>[0],
  "kind" | "f" | "repos" | "branches"
>) {
  const {
    state: { data, probe },
    actions: { setSecrets, update, probeFingerprint, change },
  } = useResourceForm();
  return (
    <>
      {kind === "server" && f.key === "fingerprint" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={probe || !data.host}
          onClick={() => void probeFingerprint()}
        >
          {probe ? <Spinner className="size-4 " /> : <Fingerprint />}
          Probe fingerprint
        </Button>
      )}
      {f.key === "webhook_secret" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            change();
            setSecrets((s) => ({
              ...s,
              webhook_secret: Array.from(
                crypto.getRandomValues(new Uint8Array(32)),
                (n) => n.toString(16).padStart(2, "0"),
              ).join(""),
            }));
          }}
        >
          <RefreshCw />
          Generate signing secret
        </Button>
      )}
    </>
  );
}

function RepositoryField({
  repos,
  resources,
}: Parameters<typeof ResourceField>[0]) {
  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();
  const gitId = String(data.gitId || "");
  const repository = String(data.repository || "");
  const provider = String(
    resources.find((r) => r.id === gitId)?.data.provider || "",
  );
  const [manualConnection, setManualConnection] = useState<string | null>(null);
  const manual =
    manualConnection === gitId ||
    (!!repository &&
      !!repos.data &&
      !repos.data.some((repo) => repo.full_name === repository));
  const options: { value: string; label: ReactNode }[] = (repos.data || []).map(
    (repo) => ({
      value: repo.full_name,
      label: <RepositoryName repository={repo.full_name} provider={provider} />,
    }),
  );
  options.push({ value: "__other__", label: "Other" });
  return (
    <>
      {repos.isFetching ? (
        <Loading label="Loading repositories…" id={`${formId}-repository`} />
      ) : (
        choose(
          manual ? "__other__" : repository,
          (value) => {
            setManualConnection(value === "__other__" ? gitId : null);
            update("repository", value === "__other__" ? "" : value);
          },
          options,
          "Select repository",
          !gitId,
          `${formId}-repository`,
        )
      )}
      <RepositoryStatus repos={repos} connected={!!gitId} />
      {manual && (
        <div className="space-y-2">
          <Label htmlFor={`${formId}-manual-repository`}>
            Repository owner/name
          </Label>
          <Input
            id={`${formId}-manual-repository`}
            value={repository}
            onChange={(event) => update("repository", event.target.value)}
            placeholder="owner/name"
            pattern="[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
            required
          />
        </div>
      )}
    </>
  );
}

function BranchField({
  branches,
  existing,
}: Parameters<typeof ResourceField>[0]) {
  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();
  const branch = String(data.branch || "");
  const options = (branches.data || []).map((value) => ({
    value: value.name,
    label: value.name,
  }));
  const savedBranch =
    existing?.data.gitId === data.gitId &&
    existing?.data.repository === data.repository
      ? String(existing?.data.branch || "")
      : "";
  if (savedBranch && !options.some((option) => option.value === savedBranch))
    options.unshift({ value: savedBranch, label: savedBranch });
  return (
    <>
      {branches.isFetching ? (
        <Loading label="Loading branches…" id={`${formId}-branch`} />
      ) : (
        choose(
          branch,
          (value) => update("branch", value),
          options,
          "Select branch",
          !data.gitId || !data.repository || options.length === 0,
          `${formId}-branch`,
        )
      )}
      {branches.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {errorMessage(branches.error)}
            <Button
              type="button"
              variant="outline"
              onClick={() => void branches.refetch()}
            >
              Retry branches
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {branches.data?.length === 0 &&
        !branches.isFetching &&
        !branches.isError && (
          <p className="text-xs text-muted-foreground">
            No branches found in this repository.
          </p>
        )}
    </>
  );
}

function SecretResourceField({
  f,
  existing,
}: Parameters<typeof ResourceField>[0]) {
  const {
    state: { secrets },
    actions: { setSecrets },
    meta: { formId },
  } = useResourceForm();
  const password = f.type === "password";
  const Control = password ? Input : Textarea;
  const stored = existing?.secretKeys.includes(f.key);
  return (
    <Control
      id={formId + "-" + f.key}
      type={password ? "password" : undefined}
      autoComplete={password ? "new-password" : undefined}
      className={password ? undefined : "min-h-20 font-mono text-xs"}
      value={secrets[f.key] || ""}
      onChange={(
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) =>
        setSecrets((current) => ({ ...current, [f.key]: event.target.value }))
      }
      placeholder={
        stored
          ? "Stored securely. Leave untouched to retain."
          : password
            ? "Enter SSH password"
            : "Paste credential"
      }
    />
  );
}

function ScalarResourceField({ f, kind }: Parameters<typeof ResourceField>[0]) {
  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();
  if (kind === "application" && (f.key === "context" || f.key === "file"))
    return (
      <InputGroup>
        <InputGroupInput
          id={`${formId}-${f.key}`}
          value={String(data[f.key] ?? "")}
          onChange={(e) => update(f.key, e.target.value)}
        />
        <InputGroupAddon>
          <InputGroupText>repository_root/</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    );
  if (f.type === "json")
    return (
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
    );
  return (
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
          f.type === "number" ? Number(e.target.value) : e.target.value,
        )
      }
    />
  );
}

function RepositoryStatus({
  repos,
  connected,
}: {
  repos: Options["repos"];
  connected: boolean;
}) {
  return (
    <>
      {" "}
      {repos.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {errorMessage(repos.error)}
            <Button
              type="button"
              variant="outline"
              onClick={() => void repos.refetch()}
            >
              Retry repositories
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {connected &&
        !repos.isFetching &&
        !repos.isError &&
        repos.data?.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No repositories found. Select Other to enter one manually.
          </p>
        )}
    </>
  );
}
