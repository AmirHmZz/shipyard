import { ProviderLogo } from "@/components/provider-name";
import { api, errorMessage, post, type Resource } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { defaults, parents, type ResourceKind } from "./definitions";
import { relativeHostname, routeHostname } from "@/lib/route-hostname";
import { dnsCredentialSchema, parseResourceForm } from "@/lib/validation";
import * as z from "zod";
export type ResourceFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: Resource[];
  existing?: Resource;
  parentId?: string;
  onSaved?: (resource: Resource) => void;
};
type ControllerProps = ResourceFormProps & { kind: ResourceKind };

function useResourceFormController({
  kind,
  resources,
  existing,
  parentId,
  onOpenChange,
  onSaved,
}: ControllerProps) {
  const changes = useConfigurationChanges();
  const formId = useId();
  const client = useQueryClient();
  const [name, setName] = useState(existing?.name || "");
  const [parent, setParent] = useState(existing?.parentId || parentId || "");
  const initialParent = resources.find(
    (r) => r.id === (existing?.parentId || parentId),
  );
  const [project, setProject] = useState(
    initialParent?.kind === "environment"
      ? initialParent.parentId || ""
      : initialParent?.kind === "project"
        ? initialParent.id
        : "",
  );
  const [team, setTeam] = useState(existing?.teamId || "");
  const [data, setData] = useState<Record<string, unknown>>(() => {
    const initial = { ...defaults[kind], ...existing?.data };
    if (kind === "route") {
      delete initial.path;
      delete initial.stripPrefix;
      const zone = resources.find((r) => r.id === initial.zoneId);
      initial.domain = relativeHostname(
        String(initial.domain || ""),
        String(zone?.data.domain || ""),
      );
    }
    if (kind === "application" && !existing) initial.branch = "";
    return initial;
  });
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [version] = useState(existing?.version || 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [probe, setProbe] = useState(false);
  const [dnsTesting, setDNSTesting] = useState(false);
  const [dnsTested, setDNSTested] = useState("");
  const dnsCredentials = JSON.stringify([data.provider, secrets.token]);
  const needsDNSTest = kind === "dns" && !existing;
  const dnsVerified = dnsTested === dnsCredentials;
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
    .filter(
      (r) =>
        r.kind === parentKind &&
        (kind !== "application" || (!!project && r.parentId === project)),
    )
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
  const gitId = String(data.gitId || "");
  const repository = String(data.repository || "");
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
      ...(kind === "application" && key === "gitId" && value !== d.gitId
        ? { repository: "", branch: "" }
        : {}),
      ...(kind === "application" &&
      key === "repository" &&
      value !== d.repository
        ? { branch: "" }
        : {}),
      ...(key === "engine"
        ? { file: value === "compose" ? "compose.yaml" : "Dockerfile" }
        : {}),
    }));
  };
  async function testDNS() {
    const credentials = dnsCredentials;
    setDNSTesting(true);
    setDNSTested("");
    setError("");
    try {
      await post(
        "/dns/test",
        dnsCredentialSchema.parse({
          provider: data.provider,
          token: secrets.token,
        }),
      );
      setDNSTested(credentials);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDNSTesting(false);
    }
  }
  async function save() {
    if (needsDNSTest && (!dnsVerified || dnsTesting)) {
      setError("Test the DNS provider successfully before saving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const resolved = { ...data };
      const writeSecrets = { ...secrets };
      if (kind === "application") {
        z.string()
          .refine(
            (value) => parentOptions.some((option) => option.value === value),
            "Select an environment in this project.",
          )
          .parse(parent);
      }
      if (kind === "route") {
        delete resolved.backendTls;
        delete resolved.backendServerName;
        delete resolved.redirect;
        if (resolved.protocol !== "tcp") resolved.tls = "terminate";
        const zoneId = z
          .string()
          .refine(
            (value) =>
              resources.some(
                (resource) => resource.kind === "zone" && resource.id === value,
              ),
            "Select a connected zone",
          )
          .parse(resolved.zoneId);
        const zone = resources.find((resource) => resource.id === zoneId)!;
        const base = String(zone.data.domain);
        resolved.domain = routeHostname(String(resolved.domain || ""), base);
      }
      const payload = parseResourceForm({
        kind,
        name: kind === "zone" ? String(resolved.domain || "zone") : name,
        parentId: parent,
        teamId: team,
        data: resolved,
        secrets: needsComposeDocument
          ? { ...writeSecrets, compose: composeYAML }
          : writeSecrets,
        version,
      });
      const resource = await api<Resource>(
        existing ? `/resources/${existing.id}` : "/resources",
        {
          method: existing ? "PUT" : "POST",
          body: JSON.stringify(
            kind === "route" ? { ...payload, name: undefined } : payload,
          ),
        },
      );
      await client.invalidateQueries({ queryKey: ["resources"] });
      changes.saved();
      toast.success(`${kind[0].toUpperCase() + kind.slice(1)} saved`);
      onOpenChange(false);
      onSaved?.(resource);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function probeFingerprint() {
    setProbe(true);
    try {
      const value = await post<{ fingerprint: string }>(
        "/servers/fingerprint",
        { host: data.host, port: data.port || 22 },
      );
      update("fingerprint", value.fingerprint);
      changes.change();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setProbe(false);
    }
  }

  return {
    state: {
      name,
      parent,
      project,
      team,
      data,
      secrets,
      busy,
      error,
      probe,
      dnsTesting,
      dnsVerified,
      composeYAML,
    },
    actions: {
      setName,
      setParent,
      setProject: (value: string) => {
        setProject(value);
        setParent("");
      },
      setTeam,
      setData,
      setSecrets,
      setComposeYAML,
      update,
      save,
      testDNS,
      probeFingerprint,
      change: changes.change,
    },
    meta: {
      formId,
      parentKind,
      parentLabel,
      parentOptions,
      gitId,
      repository,
      needsDNSTest,
      needsComposeDocument,
    },
  };
}
type FormContextValue = ReturnType<typeof useResourceFormController>;
const FormContext = createContext<FormContextValue | null>(null);
export function ResourceFormProvider({
  children,
  ...props
}: ControllerProps & { children: ReactNode }) {
  const value = useResourceFormController(props);
  return <FormContext value={value}>{children}</FormContext>;
}
export function useResourceForm() {
  const context = use(FormContext);
  if (!context)
    throw new Error("Resource form parts require their form provider");
  return context;
}
