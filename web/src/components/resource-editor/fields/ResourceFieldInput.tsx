import { Label } from "@/components/ui/label";

import type { ResourceFieldProps as ResourceFieldPropsInput } from "../types";

import { ResourceFieldControl } from "../fields/ResourceFieldControl";

export type ResourceFieldInputProps = ResourceFieldPropsInput & {
  label: string;
  formId: string;
};

export function ResourceFieldInput(props: ResourceFieldInputProps) {
  const { f, label, formId } = props;
  if (f.type === "readiness" || f.type === "previewRouting")
    return (
      <div
        role="group"
        aria-labelledby={`${formId}-${f.key}-label`}
        className="space-y-2"
      >
        <p id={`${formId}-${f.key}-label`} className="text-sm font-medium">
          {label}
        </p>
        <ResourceFieldControl {...props} />
      </div>
    );
  return (
    <>
      <Label htmlFor={`${formId}-${f.key}`}>{label}</Label>
      <ResourceFieldControl {...props} />
    </>
  );
}
