import type { ReactNode } from "react";

import { createContext, use, useId, useState } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";

import type { Resource } from "@/lib/api/types";
import type { ResourceKind } from "@/lib/resource-form-definitions";

import { ProviderLogo } from "@/components/provider-name";
import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { normalizeApplicationSettings } from "@/lib/application-settings";
import { useConfigurationChanges } from "@/lib/configuration-state";
import {
  useSaveResource,
  useTestDNSCredentials,
  useProbeServerFingerprint,
} from "@/lib/hooks";
import { defaults, parents } from "@/lib/resource-form-definitions";
import { relativeHostname, routeHostnameSchema } from "@/lib/route-hostname";
import { previewApplicationRoutingSchema } from "@/lib/schemas/application";
import { dnsCredentialSchema } from "@/lib/schemas/dns";
import { serverFingerprintFormSchema } from "@/lib/schemas/endpoint-responses";
import { resourceFormSchema } from "@/lib/schemas/resource-form";
export type ResourceFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: Resource[];
  existing?: Resource;
  parentId?: string;
  onSaved?: (resource: Resource) => void;
};
type ControllerProps = ResourceFormProps & {
  kind: ResourceKind;
};
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
  const saveResource = useSaveResource();
  const testCredentials = useTestDNSCredentials();
  const fingerprint = useProbeServerFingerprint();
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
    let initial = { ...defaults[kind], ...existing?.data };
    if (kind === "application")
      initial = {
        ...initial,
        ...normalizeApplicationSettings(
          existing?.data || initial,
          resources.filter(
            (r) => r.kind === "route" && r.parentId === existing?.id,
          ),
        ),
      };
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
  const busy = saveResource.isPending;
  const probe = fingerprint.isPending;
  const dnsTesting = testCredentials.isPending;
  const failure = saveResource.error ?? testCredentials.error;
  const error = failure ? describeError(failure) : "";
  const dnsCredentials = JSON.stringify([data.provider, secrets.token]);
  const needsDNSTest = kind === "dns" && !existing;
  const dnsVerified =
    testCredentials.isSuccess &&
    JSON.stringify([
      testCredentials.variables?.provider,
      testCredentials.variables?.token,
    ]) === dnsCredentials;
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
  function testDNS() {
    if (dnsTesting) return;
    saveResource.reset();
    testCredentials.reset();
    const parsed = dnsCredentialSchema.safeParse({
      provider: data.provider,
      token: secrets.token,
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    testCredentials.mutate(parsed.data);
  }
  function save() {
    if (busy) return;
    saveResource.reset();
    const verified = z
      .literal(true, {
        error: "Test the DNS provider successfully before saving.",
      })
      .safeParse(!needsDNSTest || (dnsVerified && !dnsTesting));
    if (!verified.success) {
      toastValidationError(verified.error);
      return;
    }
    const resolved =
      kind === "application"
        ? normalizeApplicationSettings(
            data,
            resources.filter(
              (resource) =>
                resource.kind === "route" && resource.parentId === existing?.id,
            ),
          )
        : { ...data };
    if (kind === "application") {
      const environment = z
        .string()
        .check(
          z.refine(
            (value) => parentOptions.some((option) => option.value === value),
            "Select an environment in this project.",
          ),
        )
        .safeParse(parent);
      if (!environment.success) {
        toastValidationError(environment.error);
        return;
      }
    }
    if (kind === "route") {
      delete resolved.backendTls;
      delete resolved.backendServerName;
      delete resolved.redirect;
      if (resolved.protocol !== "tcp") resolved.tls = "terminate";
      const zoneId = z
        .string()
        .check(
          z.refine(
            (value) =>
              resources.some(
                (resource) => resource.kind === "zone" && resource.id === value,
              ),
            "Select a connected zone",
          ),
        )
        .safeParse(resolved.zoneId);
      if (!zoneId.success) {
        toastValidationError(zoneId.error);
        return;
      }
      const zone = resources.find((resource) => resource.id === zoneId.data);
      if (!zone) return;
      const hostname = routeHostnameSchema.safeParse({
        relative: String(resolved.domain || ""),
        zone: String(zone.data.domain),
      });
      if (!hostname.success) {
        toastValidationError(hostname.error);
        return;
      }
      resolved.domain = hostname.data;
    }
    if (kind === "application") {
      const routing = previewApplicationRoutingSchema(
        resources.some(
          (resource) =>
            resource.kind === "route" &&
            resource.parentId === existing?.id &&
            resource.data.protocol !== "tcp",
        ),
      ).safeParse({
        enabled: !!resolved.previews,
        routing: resolved.previewRouting,
      });
      if (!routing.success) {
        toastValidationError(routing.error);
        return;
      }
    }
    const parsed = resourceFormSchema(kind).safeParse({
      kind,
      name: kind === "zone" ? String(resolved.domain || "zone") : name,
      parentId: parent,
      teamId: team,
      data: resolved,
      secrets: needsComposeDocument
        ? { ...secrets, compose: composeYAML }
        : { ...secrets },
      version,
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    saveResource.mutate(
      { existingId: existing?.id, kind, payload: parsed.data },
      {
        onSuccess: (resource) => {
          changes.saved();
          toast.success(kind[0].toUpperCase() + kind.slice(1) + " saved");
          onOpenChange(false);
          onSaved?.(resource);
        },
      },
    );
  }
  function probeFingerprint() {
    if (probe) return;
    const parsed = serverFingerprintFormSchema.safeParse({
      host: data.host,
      port: data.port || 22,
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    fingerprint.mutate(parsed.data, {
      onSuccess: (value) => {
        update("fingerprint", value.fingerprint);
        changes.change();
      },
    });
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
}: ControllerProps & {
  children: ReactNode;
}) {
  const value = useResourceFormController(props);
  return <FormContext value={value}>{children}</FormContext>;
}
export function useResourceForm() {
  const context = use(FormContext);
  if (!context)
    throw new Error("Resource form parts require their form provider");
  return context;
}
