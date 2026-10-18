import { ProviderLogo } from "@/components/provider-name";
import { api, errorMessage, post, type Resource } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { defaults, fields, parents, type ResourceKind } from "./definitions";
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
  const [runtimeVariables, setRuntimeVariables] = useState("");
  const formId = useId();
  const client = useQueryClient();
  const [name, setName] = useState(existing?.name || "");
  const [parent, setParent] = useState(existing?.parentId || parentId || "");
  const [team, setTeam] = useState(existing?.teamId || "");
  const [data, setData] = useState<Record<string, unknown>>(() => {
    const initial = { ...defaults[kind], ...existing?.data };
    if (kind === "route") {
      delete initial.path;
      delete initial.stripPrefix;
    }
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
      await post("/dns/test", {
        provider: data.provider,
        token: secrets.token,
      });
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
            ...(kind === "route"
              ? {}
              : {
                  name:
                    kind === "zone" ? String(resolved.domain || "zone") : name,
                }),
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
      team,
      data,
      secrets,
      busy,
      error,
      probe,
      dnsTesting,
      dnsVerified,
      runtimeVariables,
      composeYAML,
    },
    actions: {
      setName,
      setParent,
      setTeam,
      setData,
      setSecrets,
      setRuntimeVariables,
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
