import type { ChangeEvent, MouseEvent } from "react";

import { useDeferredValue, useState } from "react";
import { useNavigate } from "react-router";

import type { Resource } from "@/lib/api/types";

import { useResources } from "@/lib/hooks/useResources";

function resourcePath(resource: Resource) {
  if (resource.kind === "application") return `/applications/${resource.id}`;
  if (resource.kind === "project") return `/projects/${resource.id}`;
  if (resource.kind === "server") return "/servers";
  if (resource.kind === "zone") return "/dns";
  return "/integrations";
}
export function useWorkspaceSearch(onOpenChange: (open: boolean) => void) {
  const resources = useResources();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const matches: Resource[] = [];
  const term = deferredQuery.toLowerCase();
  for (const resource of resources.data || []) {
    if (resource.name.toLowerCase().includes(term)) matches.push(resource);
    if (matches.length === 20) break;
  }
  function changeQuery(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.currentTarget.value);
  }
  function selectResource(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-resource-id]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    const resource = matches.find(
      (resource) => resource.id === button.dataset.resourceId,
    );
    if (!resource) return;
    navigate(resourcePath(resource));
    onOpenChange(false);
  }
  return {
    state: { query },
    derived: { matches },
    handlers: { changeQuery, selectResource },
  };
}
