import { Plus } from "lucide-react";

import { Empty } from "@/components/Shared";
import { Button } from "@/components/ui/button";

import type { useProjectsPage } from "../hooks";

import { ProjectApplications } from "./ProjectApplications";
import { ProjectCard } from "./ProjectCard";
import { ProjectEnvironments } from "./ProjectEnvironments";
export type ProjectContentProps = {
  controller: ReturnType<typeof useProjectsPage>;
  previews: boolean;
};
export function ProjectContent({ controller, previews }: ProjectContentProps) {
  const { id, applications, projects, index } = controller.derived;
  const { getStarted, handleProjectAction } = controller.handlers;
  if (previews)
    return (
      <ProjectApplications
        apps={applications}
        controller={controller}
        previews
      />
    );
  if (id) return <ProjectEnvironments controller={controller} />;
  if (projects.length)
    return (
      <div
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        onClick={handleProjectAction}
      >
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} index={index} />
        ))}
      </div>
    );
  return (
    <Empty
      title="Everything starts with a project"
      description="Create a team first, then organize your deployments into projects."
      action={
        <Button onClick={getStarted}>
          <Plus />
          Get started
        </Button>
      }
    />
  );
}
