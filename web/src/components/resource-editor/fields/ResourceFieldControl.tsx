import { PreviewRoutingFields } from "@/components/preview-routing-fields";
import { ReadinessFields } from "@/components/readiness-fields";
import { useResourceForm } from "@/components/resource-forms/controller";
import {
  readinessChecksDraftSchema,
  previewRoutingDraftSchema,
} from "@/lib/schemas/application";

import type { ResourceFieldProps } from "../types";

import { BranchField } from "../fields/BranchField";
import { RepositoryField } from "../fields/RepositoryField";
import { StandardResourceFieldControl } from "../fields/StandardResourceFieldControl";

export function ResourceFieldControl(props: ResourceFieldProps) {
  const { kind, f } = props;
  const {
    state: { data },
    actions: { update },
  } = useResourceForm();
  if (kind === "application" && f.key === "readinessChecks") {
    const parsed = readinessChecksDraftSchema.safeParse(
      data.readinessChecks || [],
    );
    return (
      <ReadinessFields
        value={parsed.success ? parsed.data : []}
        onChange={(v) => update(f.key, v)}
        dockerfile={data.engine === "dockerfile"}
      />
    );
  }
  if (kind === "application" && f.key === "previewRouting") {
    const parsed = previewRoutingDraftSchema.safeParse(
      data.previewRouting || { mode: "inherit" },
    );
    return (
      <PreviewRoutingFields
        value={parsed.success ? parsed.data : { mode: "inherit" }}
        onChange={(v) => update(f.key, v)}
        hasRoutes={props.resources.some(
          (r) =>
            r.kind === "route" &&
            r.parentId === props.existing?.id &&
            r.data.protocol !== "tcp",
        )}
      />
    );
  }

  if (kind === "application" && f.key === "repository")
    return <RepositoryField {...props} />;
  if (kind === "application" && f.key === "branch")
    return <BranchField {...props} />;
  return <StandardResourceFieldControl {...props} />;
}
