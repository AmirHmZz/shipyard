import type { ResourceFormProps } from "@/components/resource-forms/controller";

import { ResourceForm } from "./ResourceForm";

export function ResourceEditor(props: ResourceFormProps & { kind: string }) {
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
