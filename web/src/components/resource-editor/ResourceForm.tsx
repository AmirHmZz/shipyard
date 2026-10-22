import * as z from "zod/mini";

import type { ResourceFormProps as ControllerProps } from "@/components/resource-forms/controller";

import { ResourceFormProvider } from "@/components/resource-forms/controller";
import { ErrorState } from "@/components/Shared";
import { RESOURCE_KINDS } from "@/lib/enums";

import { ResourceFormView } from "./ResourceFormView";
const resourceKindSchema = z.enum(RESOURCE_KINDS);
export type ResourceFormProps = ControllerProps & { kind: string };
export function ResourceForm({ kind, ...props }: ResourceFormProps) {
  const parsed = resourceKindSchema.safeParse(kind);
  if (!parsed.success)
    return <ErrorState error={new Error("Unsupported resource kind")} />;
  if (props.existing && props.existing.kind !== kind)
    return (
      <ErrorState
        error={new Error("Resource kind does not match the requested form")}
      />
    );
  return (
    <ResourceFormProvider key={parsed.data} {...props} kind={parsed.data}>
      <ResourceFormView {...props} kind={parsed.data} />
    </ResourceFormProvider>
  );
}
