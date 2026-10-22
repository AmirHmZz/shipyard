import type {
  HTTPReadinessCheck,
  PreviewRouting,
} from "@/lib/application-settings";

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

export type ResourceFieldControlProps = ResourceFieldProps;
export function ResourceFieldControl(props: ResourceFieldControlProps) {
  function handleReadinessFieldsChange(v: HTTPReadinessCheck[]) {
    return update(f.key, v);
  }
  function handlePreviewRoutingFieldsChange(v: PreviewRouting) {
    return update(f.key, v);
  }

  const { kind, f } = props;
  const {
    state: { data },
    handlers: { update },
  } = useResourceForm();
  if (kind === "application" && f.key === "readinessChecks") {
    const parsed = readinessChecksDraftSchema.safeParse(
      data.readinessChecks || [],
    );
    return (
      <ReadinessFields
        value={parsed.success ? parsed.data : []}
        onChange={handleReadinessFieldsChange}
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
        onChange={handlePreviewRoutingFieldsChange}
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
