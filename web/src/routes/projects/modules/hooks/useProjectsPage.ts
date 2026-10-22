import type { MouseEvent } from "react";

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
  function selectEnvironment(value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("environment", value);
      return next;
    });
  }
  function handleProjectAction(event: MouseEvent<HTMLElement>) {
    if (!(event.target instanceof Element)) return;
    // Menu items render in a portal; React still bubbles their clicks here.
    const target = event.target.closest<HTMLElement>(
      "[data-project-action][data-project-id]",
    );
    if (
      !target ||
      target.hasAttribute("data-disabled") ||
      target.getAttribute("aria-disabled") === "true"
    )
      return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    const resource = index.byId.get(target.dataset.projectId || "");
    if (!resource) return;
    if (target.dataset.projectAction === "edit")
      openEditor({ kind: resource.kind, existing: resource });
    if (target.dataset.projectAction === "delete") setDeleting(resource);
    if (target.dataset.projectAction === "variables")
      navigate(
        `/configure/variables/${resource.id}?return=${encodeURIComponent(location.pathname + location.search)}`,
      );
  }
  function createEnvironment() {
    openEditor({ kind: "environment", parentId: id });
  }
  function getStarted() {
    openEditor({
      kind: resources.some((resource) => resource.kind === "team")
        ? "project"
        : "team",
    });
  }
  function retryProjectDeletion() {
    if (project) setDeleting(project);
  }
  function handleEditorOpenChange(open: boolean) {
    if (!open) setEditor(null);
  }
  function closeDeletion() {
    setDeleting(null);
  }
  function resourceDeleted() {
    if (state.deleting && id === state.deleting.id) navigate("/projects");
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
      selectEnvironment,
      handleProjectAction,
      createEnvironment,
      getStarted,
      retryProjectDeletion,
      handleEditorOpenChange,
      closeDeletion,
      resourceDeleted,
    },
  };
}
