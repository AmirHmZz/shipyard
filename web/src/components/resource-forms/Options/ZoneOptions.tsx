import type { Props } from "@/components/resource-forms/Options/types";

import { emptyOptions } from "@/components/resource-forms/Options/constants";
import { useProviderZones } from "@/lib/hooks";

import { ResourceOptionsContext } from "./context";

export type ZoneOptionsProps = Props;

export function ZoneOptions({ parent, open, children }: ZoneOptionsProps) {
  const availableZones = useProviderZones(parent, open);
  return (
    <ResourceOptionsContext value={{ ...emptyOptions, availableZones }}>
      {children}
    </ResourceOptionsContext>
  );
}
