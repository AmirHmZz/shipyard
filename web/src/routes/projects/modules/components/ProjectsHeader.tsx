import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";

import type { EditorRequest } from "../generics";

export function ProjectsHeader({
  id,
  project,
  previews,
  environments,
  currentEnvironment,
  resources,
  openEditor,
}: {
  id?: string;
  project?: Resource;
  previews: boolean;
  environments: Resource[];
  currentEnvironment?: Resource;
  resources: Resource[];
  openEditor: (request: EditorRequest) => void;
}) {
  return (
    <PageHeader
      eyebrow="Workspace"
      breadcrumbs={
        id
          ? [
              { label: "Projects", to: "/projects" },
              { label: project?.name || "Project" },
            ]
          : undefined
      }
      title={previews ? "Pull request previews" : project?.name || "Projects"}
      description={
        previews
          ? "Isolated deployments for work in progress. Production secrets stay separate."
          : id
            ? "One project. Separate environments. Clear boundaries."
            : "A home for your applications and the teams that ship them."
      }
    >
      {!previews &&
        (id ? (
          <>
            <Button
              disabled={!project?.canWrite || !!project?.data.deleting}
              variant="outline"
              onClick={() => openEditor({ kind: "environment", parentId: id })}
            >
              <Plus />
              Environment
            </Button>
            <Button
              disabled={
                !project?.canWrite ||
                !!project?.data.deleting ||
                !environments.length
              }
              onClick={() =>
                openEditor({
                  kind: "application",
                  parentId: currentEnvironment?.id,
                })
              }
            >
              <Plus />
              Application
            </Button>
          </>
        ) : (
          <Button
            disabled={!resources.some((r) => r.kind === "team" && r.canWrite)}
            onClick={() => openEditor({ kind: "project" })}
          >
            <Plus />
            New project
          </Button>
        ))}
    </PageHeader>
  );
}
