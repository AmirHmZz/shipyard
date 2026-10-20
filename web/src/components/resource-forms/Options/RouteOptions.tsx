import type { Props } from "@/components/resource-forms/Options/types";

import { emptyOptions } from "@/components/resource-forms/Options/constants";
import { useServiceOptions } from "@/lib/hooks";

import { ResourceOptionsContext } from "./context";

export type RouteOptionsProps = Props;

export function RouteOptions({ parent, open, children }: RouteOptionsProps) {
  const services = useServiceOptions(parent, open);
  return (
    <ResourceOptionsContext value={{ ...emptyOptions, services }}>
      {children}
    </ResourceOptionsContext>
  );
}
