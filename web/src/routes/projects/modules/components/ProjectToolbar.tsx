import { Settings2, Trash2 } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Filter } from "@/components/Shared";
import { Button } from "@/components/ui/button";

import type { EditorRequest } from "../generics";

export type ProjectToolbarProps = {
  id?: string;
  project?: Resource;
  filter: string;
  setFilter: (value: string) => void;
  openEditor: (request: EditorRequest) => void;
  setDeleting: (resource: Resource) => void;
};
export function ProjectToolbar({
  id,
  project,
  filter,
  setFilter,
  openEditor,
  setDeleting,
}: ProjectToolbarProps) {
  function handleButtonClick() {
    return openEditor({ kind: "project", existing: project });
  }
  function handleButtonClick2() {
    if (project) setDeleting(project);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <Filter value={filter} onChange={setFilter} />
      {id && project && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!project.canWrite || !!project.data.deleting}
            variant="ghost"
            size="sm"
            onClick={handleButtonClick}
          >
            <Settings2 />
            Project settings
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!project.canWrite || !!project.data.deleting}
            onClick={handleButtonClick2}
          >
            <Trash2 />
            Delete project
          </Button>
        </div>
      )}
    </div>
  );
}
