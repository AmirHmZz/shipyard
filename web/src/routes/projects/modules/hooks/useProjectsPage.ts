import { useReducer } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import type { Resource } from "@/lib/api/types";

import { useResources } from "@/lib/hooks/useResources";
import { indexResources } from "@/lib/resource-index";

import type { EditorRequest } from "../generics";

import { initialProjectsState, projectsReducer } from "../generics";

export function useProjectsPage(previews: boolean) {
  const q = useResources();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [state, dispatch] = useReducer(projectsReducer, initialProjectsState);
  const resources = q.data ?? [];
  const index = indexResources(resources);
  const project = index.byId.get(id ?? "");
  const environments = resources.filter(
    (resource) => resource.kind === "environment" && resource.parentId === id,
  );
  const activeEnvironment = params.get("environment") ?? "";
  const currentEnvironment =
    environments.find((environment) => environment.id === activeEnvironment) ??
    environments[0];
  const applications = resources.filter(
    (resource) =>
      resource.kind === "application" &&
      !!resource.data.previewOf === previews &&
      !resource.data.previewClosed,
  );
  const projects = resources.filter(
    (resource) =>
      resource.kind === "project" &&
      resource.name.toLowerCase().includes(state.filter.toLowerCase()),
  );
  function setDeleting(resource: Resource | null) {
    dispatch({ type: "deletion_changed", resource });
  }
  function setFilter(value: string) {
    dispatch({ type: "filter_changed", value });
  }
  function setEditor(request: EditorRequest | null) {
    dispatch({ type: "editor_changed", request });
  }
  function openEditor(request: EditorRequest) {
    if (["team", "project", "environment"].includes(request.kind)) {
      setEditor(request);
      return;
    }
    navigate(
      `/configure/${request.kind}/${request.existing?.id || "new"}?parent=${request.parentId || ""}&return=${encodeURIComponent(location.pathname + location.search)}`,
    );
  }
  return {
    state,
    derived: {
      q,
      resources,
      index,
      id,
      project,
      environments,
      currentEnvironment,
      applications,
      projects,
    },
    handlers: {
      navigate,
      setParams,
      setDeleting,
      setFilter,
      setEditor,
      openEditor,
    },
  };
}
