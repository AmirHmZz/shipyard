import { useResourceForm } from "@/components/resource-forms/controller";
import { ResourceOptions } from "@/components/resource-forms/Options";

import type { ResourceFormViewOptions } from "./types";

import { ResourceFormContent } from "./ResourceFormContent";
export type ResourceFormViewProps = ResourceFormViewOptions;
export function ResourceFormView(props: ResourceFormViewProps) {
  const {
    state: { parent, data },
  } = useResourceForm();

  return (
    <ResourceOptions
      kind={props.kind}
      parent={parent}
      data={data}
      open={props.open}
    >
      <ResourceFormContent {...props} />
    </ResourceOptions>
  );
}
