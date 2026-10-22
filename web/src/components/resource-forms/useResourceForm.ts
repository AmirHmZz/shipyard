import { use } from "react";

import { ResourceFormContext } from "./context";
export function useResourceForm() {
  const context = use(ResourceFormContext);
  if (!context)
    throw new Error("Resource form parts require their form provider");
  return context;
}
