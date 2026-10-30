import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { ResourceLogo } from "@/components/ResourceLogo";
import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";

import type { EditorRequest } from "../generics";

export type ProjectsHeaderProps = {
  id?: string;
  project?: Resource;
  previews: boolean;
  environments: Resource[];
  currentEnvironment?: Resource;
  resources: Resource[];
  openEditor: (request: EditorRequest) => void;
};
export function ProjectsHeader({
  id,
  project,
  previews,
  environments,
  currentEnvironment,
  resources,
  openEditor,
}: ProjectsHeaderProps) {
  function handleButtonClick() {
    return openEditor({ kind: "environment", parentId: id });
  }
  function handleButtonClick2() {
    return openEditor({
      kind: "application",
      parentId: currentEnvironment?.id,
    });
  }
  function handleButtonClick3() {
    return openEditor({ kind: "project" });
  }

  let description =
    "A home for your applications and the teams that ship them.";
  if (id) description = "One project. Separate environments. Clear boundaries.";
  if (previews)
    description =
      "Isolated deployments for work in progress. Production secrets stay separate.";
  return (
    <PageHeader
      icon={project && <ResourceLogo resource={project} />}
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
      description={description}
    >
      {!previews &&
        (id ? (
          <>
            <Button
              disabled={!project?.canWrite || !!project?.data.deleting}
              variant="outline"
              onClick={handleButtonClick}
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
              onClick={handleButtonClick2}
            >
              <Plus />
              Application
            </Button>
          </>
        ) : (
          <Button
            disabled={!resources.some((r) => r.kind === "team" && r.canWrite)}
            onClick={handleButtonClick3}
          >
            <Plus />
            New project
          </Button>
        ))}
    </PageHeader>
  );
}
