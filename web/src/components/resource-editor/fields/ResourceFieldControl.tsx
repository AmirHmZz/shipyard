import type { ResourceFieldProps } from "../types";
import { StandardResourceFieldControl } from "../fields/StandardResourceFieldControl";
import { RepositoryField } from "../fields/RepositoryField";
import { BranchField } from "../fields/BranchField";

export function ResourceFieldControl(props: ResourceFieldProps) {
  const { kind, f } = props;
  if (kind === "application" && f.key === "repository")
    return <RepositoryField {...props} />;
  if (kind === "application" && f.key === "branch")
    return <BranchField {...props} />;
  return <StandardResourceFieldControl {...props} />;
}
