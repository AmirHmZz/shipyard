import type {
  HTTPReadinessCheck,
  PreviewRouting,
} from "@/lib/application-settings";

import { PreviewRoutingFields } from "@/components/preview-routing-fields";
import { ReadinessFields } from "@/components/readiness-fields";
import { useResourceForm } from "@/components/resource-forms/controller";

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
  if (kind === "application" && f.key === "readinessChecks")
    return (
      <ReadinessFields
        value={(data.readinessChecks || []) as HTTPReadinessCheck[]}
        onChange={(v) => update(f.key, v)}
        dockerfile={data.engine === "dockerfile"}
      />
    );
  if (kind === "application" && f.key === "previewRouting")
    return (
      <PreviewRoutingFields
        value={(data.previewRouting || { mode: "inherit" }) as PreviewRouting}
        onChange={(v) => update(f.key, v)}
        hasRoutes={props.resources.some(
          (r) =>
            r.kind === "route" &&
            r.parentId === props.existing?.id &&
            r.data.protocol !== "tcp",
        )}
      />
    );

  if (kind === "application" && f.key === "repository")
    return <RepositoryField {...props} />;
  if (kind === "application" && f.key === "branch")
    return <BranchField {...props} />;
  return <StandardResourceFieldControl {...props} />;
}
