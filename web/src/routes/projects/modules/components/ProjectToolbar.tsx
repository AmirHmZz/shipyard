import { Settings2, Trash2 } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Filter } from "@/components/shared";
import { Button } from "@/components/ui/button";

import type { EditorRequest } from "../generics";

export function ProjectToolbar({
  id,
  project,
  filter,
  setFilter,
  openEditor,
  setDeleting,
}: {
  id?: string;
  project?: Resource;
  filter: string;
  setFilter: (value: string) => void;
  openEditor: (request: EditorRequest) => void;
  setDeleting: (resource: Resource) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <Filter value={filter} onChange={setFilter} />
      {id && project && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!project.canWrite || !!project.data.deleting}
            variant="ghost"
            size="sm"
            onClick={() => openEditor({ kind: "project", existing: project })}
          >
            <Settings2 />
            Project settings
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!project.canWrite || !!project.data.deleting}
            onClick={() => setDeleting(project)}
          >
            <Trash2 />
            Delete project
          </Button>
        </div>
      )}
    </div>
  );
}
