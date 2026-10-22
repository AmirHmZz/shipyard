import { DeleteResource, DeletionStatus } from "@/components/DeleteResource";
import { ResourceEditor } from "@/components/resource-editor";
import { ErrorState, Loading } from "@/components/Shared";

import { useProjectsPage } from "../hooks";
import { ProjectContent } from "./ProjectContent";
import { ProjectsHeader } from "./ProjectsHeader";
import { ProjectToolbar } from "./ProjectToolbar";
export type ProjectsMainViewProps = { previews?: boolean };
export function ProjectsMainView({ previews = false }: ProjectsMainViewProps) {
  const controller = useProjectsPage(previews);
  const { state, derived, handlers } = controller;
  const { deleting, filter, editor } = state;
  const { q, resources, id, project, environments, currentEnvironment } =
    derived;
  const {
    setFilter,
    setDeleting,
    openEditor,
    retryProjectDeletion,
    handleEditorOpenChange,
    closeDeletion,
    resourceDeleted,
  } = handlers;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <ProjectsHeader
        id={id}
        project={project}
        previews={previews}
        environments={environments}
        currentEnvironment={currentEnvironment}
        resources={resources}
        openEditor={openEditor}
      />
      <ProjectToolbar
        id={id}
        project={project}
        filter={filter}
        setFilter={setFilter}
        openEditor={openEditor}
        setDeleting={setDeleting}
      />
      {project && (
        <DeletionStatus resource={project} onRetry={retryProjectDeletion} />
      )}
      <ProjectContent controller={controller} previews={previews} />
      {editor && (
        <ResourceEditor
          open
          onOpenChange={handleEditorOpenChange}
          kind={editor.kind}
          existing={editor.existing}
          parentId={editor.parentId}
          resources={resources}
        />
      )}
      {deleting && (
        <DeleteResource
          resource={resources.find((r) => r.id === deleting.id) || deleting}
          onClose={closeDeletion}
          onDeleted={resourceDeleted}
        />
      )}
    </>
  );
}
