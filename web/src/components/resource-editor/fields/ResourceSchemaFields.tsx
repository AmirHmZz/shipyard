import { useResourceForm } from "@/components/resource-forms/controller";
import { fields } from "@/lib/resource-form-definitions";

import type { ResourceFieldProps } from "../types";

import { COMPOSE_HIDDEN_FIELDS } from "../constants";
import { ResourceField } from "../fields/ResourceField";

export function ResourceSchemaFields({
  kind,
  resources,
  existing,
  services,
  repos,
  branches,
}: Omit<ResourceFieldProps, "f">) {
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
              ["previewDomain", "previewZoneId", "previewRouting"].includes(
                f.key,
              ) &&
              !data.previews
            ),
        )
        .filter(
          (f) =>
            !(
              kind === "application" &&
              ["previewDomain", "previewZoneId"].includes(f.key) &&
              (data.previewRouting as { mode?: string })?.mode === "private"
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
