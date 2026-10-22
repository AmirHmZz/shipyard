import type { Props } from "@/components/resource-forms/Options/types";

import { emptyOptions } from "@/components/resource-forms/Options/constants";

import { ApplicationOptions } from "./ApplicationOptions";
import { ResourceOptionsContext } from "./context";
import { RouteOptions } from "./RouteOptions";
import { ZoneOptions } from "./ZoneOptions";

export type ResourceOptionsProps = Props;

export function ResourceOptions(props: ResourceOptionsProps) {
  switch (props.kind) {
    case "zone":
      return <ZoneOptions {...props} />;
    case "route":
      return <RouteOptions {...props} />;
    case "application":
      return <ApplicationOptions {...props} />;
    default:
      return (
        <ResourceOptionsContext value={emptyOptions}>
          {props.children}
        </ResourceOptionsContext>
      );
  }
}
