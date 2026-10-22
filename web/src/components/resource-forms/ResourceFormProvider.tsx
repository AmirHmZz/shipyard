import type { ReactNode } from "react";

import type { ResourceFormControllerProps } from "./useResourceFormController";

import { ResourceFormContext } from "./context";
import { useResourceFormController } from "./useResourceFormController";
export type ResourceFormProviderProps = ResourceFormControllerProps & {
  children: ReactNode;
};
export function ResourceFormProvider({
  children,
  ...props
}: ResourceFormProviderProps) {
  const value = useResourceFormController(props);
  return <ResourceFormContext value={value}>{children}</ResourceFormContext>;
}
