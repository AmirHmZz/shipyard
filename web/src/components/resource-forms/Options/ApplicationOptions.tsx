import type { Props } from "@/components/resource-forms/Options/types";

import { emptyOptions } from "@/components/resource-forms/Options/constants";
import { useApplicationOptions } from "@/lib/hooks/useApplicationOptions";

import { ResourceOptionsContext } from "./context";

export type ApplicationOptionsProps = Props;

export function ApplicationOptions({
  data,
  open,
  children,
}: ApplicationOptionsProps) {
  const { derived } = useApplicationOptions(data, open);
  return (
    <ResourceOptionsContext value={{ ...emptyOptions, ...derived }}>
      {children}
    </ResourceOptionsContext>
  );
}
