import { use } from "react";

import { ResourceOptionsContext } from "./context";

export function useResourceOptions() {
  return use(ResourceOptionsContext);
}
