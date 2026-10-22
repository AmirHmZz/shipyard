import type { ResourceFormProps } from "@/components/resource-forms/controller";

import { ResourceForm } from "./ResourceForm";

export type ResourceEditorProps = ResourceFormProps & { kind: string };
export function ResourceEditor(props: ResourceEditorProps) {
  if (!props.open) return null;
  return (
    <ResourceForm
      key={
        props.kind +
        ":" +
        (props.existing?.id || "new") +
        ":" +
        (props.parentId || "")
      }
      {...props}
    />
  );
}
