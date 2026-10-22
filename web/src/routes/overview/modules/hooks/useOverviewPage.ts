import { useState } from "react";
import { useNavigate } from "react-router";

import { useDeployments } from "@/lib/hooks/useDeployments";
import { useResources } from "@/lib/hooks/useResources";
import { indexResources } from "@/lib/resource-index";
export function useOverviewPage() {
  const resources = useResources();
  const deployments = useDeployments();
  const index = indexResources(resources.data || []);
  const [editor, setEditor] = useState("");
  const navigate = useNavigate();
  function openEditor(kind: string) {
    return ["team", "project", "environment"].includes(kind)
      ? setEditor(kind)
      : navigate(`/configure/${kind}/new?return=/`);
  }
  const rows = resources.data || [];
  const projects = index.byKind.get("project") || [];
  const apps = (index.byKind.get("application") || []).filter(
    (r) => !r.data.previewOf,
  );
  const servers = index.byKind.get("server") || [];
  const previews = (index.byKind.get("application") || []).filter(
    (r) =>
      r.kind === "application" && r.data.previewOf && !r.data.previewClosed,
  );

  function createProject() {
    openEditor("project");
  }
  function handleEditorOpenChange(open: boolean) {
    if (!open) setEditor("");
  }
  return {
    state: { editor },
    derived: {
      resources,
      deployments,
      index,
      rows,
      projects,
      apps,
      servers,
      previews,
    },
    handlers: { openEditor, createProject, handleEditorOpenChange },
  };
}
