import { useId, useReducer } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";

import type { Resource } from "@/lib/api/types";
import type { ResourceKind } from "@/lib/resource-form-definitions";

import { ProviderLogo } from "@/components/ProviderName";
import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { normalizeApplicationSettings } from "@/lib/application-settings";
import { usesInlineCompose } from "@/lib/compose-source";
import { useConfigurationChanges } from "@/lib/configuration-state";
import {
  useSaveResource,
  useTestDNSCredentials,
  useProbeServerFingerprint,
} from "@/lib/hooks";
import { useApplicationDomainAccess } from "@/lib/hooks/useApplicationDomainAccess";
import { parents } from "@/lib/resource-form-definitions";
import { relativeHostname, routeHostnameSchema } from "@/lib/route-hostname";
import { previewApplicationRoutingSchema } from "@/lib/schemas/application";
import { dnsCredentialSchema } from "@/lib/schemas/dns";
import { serverFingerprintFormSchema } from "@/lib/schemas/endpoint-responses";
import { rateLimitsSchema } from "@/lib/schemas/rate-limits";
import { resourceFormSchema } from "@/lib/schemas/resource-form";

import { initialResourceFormState, resourceFormReducer } from "./state";
export type ResourceFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: Resource[];
  existing?: Resource;
  parentId?: string;
  onSaved?: (resource: Resource) => void;
};
export type ResourceFormControllerProps = ResourceFormProps & {
  kind: ResourceKind;
};

function routeSubdomainDraft(value: unknown, original: unknown, zone?: string) {
  const hostname = String(value || "");
  return zone && hostname === original
    ? relativeHostname(hostname, zone)
    : hostname;
}

function prepareRouteForSave(
  data: Record<string, unknown>,
  relative: string,
  zone: string,
): boolean {
  if (data.protocol === "https") {
    const rules = rateLimitsSchema.safeParse(data.rateLimits);
    if (!rules.success) {
      toastValidationError(rules.error);
      return false;
    }
    data.rateLimits = rules.data;
  } else {
    delete data.rateLimits;
  }
  delete data.backendTls;
  delete data.backendServerName;
  delete data.redirect;
  if (data.protocol !== "tcp") data.tls = "terminate";
  const hostname = routeHostnameSchema.safeParse({ relative, zone });
  if (!hostname.success) {
    toastValidationError(hostname.error);
    return false;
  }
  data.domain = hostname.data;
  return true;
}

export function useResourceFormController({
  kind,
  resources,
  existing,
  parentId,
  onOpenChange,
  onSaved,
}: ResourceFormControllerProps) {
  const changes = useConfigurationChanges();
  const formId = useId();
  const saveResource = useSaveResource();
  const testCredentials = useTestDNSCredentials();
  const fingerprint = useProbeServerFingerprint();
  const [formState, dispatch] = useReducer(
    resourceFormReducer,
    { kind, resources, existing, parentId },
    initialResourceFormState,
  );
  const { name, parent, project, team, data, secrets, version, composeYAML } =
    formState;
  const domainAccess = useApplicationDomainAccess(
    kind === "route" ? parent : "",
  );
  const routeZone = domainAccess.data?.find(
    (zone) => zone.zoneId === data.zoneId,
  );
  const routeSubdomain = routeSubdomainDraft(
    data.domain,
    existing?.data.domain,
    routeZone?.domain,
  );
  function setName(value: string) {
    dispatch({ type: "name_changed", value });
  }
  function setParent(value: string) {
    dispatch({ type: "parent_changed", value });
  }
  function setProject(value: string) {
    dispatch({ type: "project_changed", value });
  }
  function setTeam(value: string) {
    dispatch({ type: "team_changed", value });
  }
  function setData(value: Record<string, unknown>) {
    dispatch({ type: "data_changed", value });
  }
  function setSecret(key: string, value: string) {
    dispatch({ type: "secret_changed", key, value });
  }
  function setComposeYAML(value: string) {
    dispatch({ type: "compose_changed", value });
  }
  const busy = saveResource.isPending;
  const probe = fingerprint.isPending;
  const dnsTesting = testCredentials.isPending;
  const failure = saveResource.error ?? testCredentials.error;
  const error = failure ? describeError(failure) : "";
  const dnsCredentials = JSON.stringify([
    data.provider,
    secrets.token,
    data.proxyId || "",
  ]);
  const needsDNSTest = kind === "dns" && !existing;
  const dnsVerified =
    testCredentials.isSuccess &&
    JSON.stringify([
      testCredentials.variables?.provider,
      testCredentials.variables?.token,
      testCredentials.variables?.proxyId || "",
    ]) === dnsCredentials;
  const needsComposeDocument =
    kind === "application" &&
    usesInlineCompose(data) &&
    !usesInlineCompose(existing?.data ?? {});
  const parentKind = parents[kind];
  let parentLabel = "";
  if (parentKind)
    parentLabel = parentKind[0].toUpperCase() + parentKind.slice(1);
  if (parentKind === "dns") parentLabel = "DNS provider";
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
  function update(key: string, value: unknown) {
    dispatch({ type: "data_field_changed", key, value });
  }
  function testDNS() {
    if (dnsTesting) return;
    saveResource.reset();
    testCredentials.reset();
    const parsed = dnsCredentialSchema.safeParse({
      provider: data.provider,
      token: secrets.token,
      proxyId: String(data.proxyId || ""),
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
            existing?.data,
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
    if (
      kind === "route" &&
      !prepareRouteForSave(resolved, routeSubdomain, routeZone?.domain ?? "")
    )
      return;
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
    handlers: {
      setName,
      setParent,
      setProject,
      setTeam,
      setData,
      setSecret,
      setComposeYAML,
      update,
      save,
      testDNS,
      probeFingerprint,
      change: changes.change,
    },
    derived: {
      formId,
      parentKind,
      parentLabel,
      parentOptions,
      gitId,
      repository,
      needsDNSTest,
      needsComposeDocument,
      domainAccess,
      routeZone,
      routeSubdomain,
    },
  };
}
