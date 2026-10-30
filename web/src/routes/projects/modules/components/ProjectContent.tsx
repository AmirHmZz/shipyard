import { Plus } from "lucide-react";

import { ResourceCardGrid } from "@/components/ResourceCardGrid";
import { Empty } from "@/components/Shared";
import { SortableResourceCard } from "@/components/SortableResourceCard";
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
      <div onClick={handleProjectAction}>
        <ResourceCardGrid resources={projects}>
          {projects.map((project, position) => (
            <SortableResourceCard
              key={project.id}
              resource={project}
              index={position}
              disabled={!!controller.state.filter}
            >
              <ProjectCard project={project} index={index} />
            </SortableResourceCard>
          ))}
        </ResourceCardGrid>
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
