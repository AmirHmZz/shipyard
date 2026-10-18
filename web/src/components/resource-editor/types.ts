import type { ResourceFormProps } from "@/components/resource-forms/controller";
import type {
  ResourceKind,
  Field,
} from "@/components/resource-forms/definitions";
import type { Options } from "@/components/resource-forms/options";
export type ResourceFieldProps = {
  kind: ResourceKind;
  resources: ResourceFormProps["resources"];
  existing?: ResourceFormProps["existing"];
  services: Options["services"];
  repos: Options["repos"];
  branches: Options["branches"];
  f: Field;
};
