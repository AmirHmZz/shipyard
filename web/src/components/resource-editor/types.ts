import type { ResourceFormProps } from "@/components/resource-forms/controller";
import type { Options } from "@/components/resource-forms/Options";
import type { ResourceKind, Field } from "@/lib/resource-form-definitions";
export type ResourceFormViewOptions = ResourceFormProps & {
  kind: ResourceKind;
};
export type ResourceFieldProps = {
  kind: ResourceKind;
  resources: ResourceFormProps["resources"];
  existing?: ResourceFormProps["existing"];
  services: Options["services"];
  repos: Options["repos"];
  branches: Options["branches"];
  f: Field;
};
