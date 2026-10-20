import type { Resource } from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";

import type { useProjectsPage } from "../hooks";

import { ProjectApplications } from "./ProjectApplications";
export type ProjectEnvironmentProps = {
  environment: Resource;
  controller: ReturnType<typeof useProjectsPage>;
};
export function ProjectEnvironment({
  environment: env,
  controller,
}: ProjectEnvironmentProps) {
  const { currentEnvironment } = controller.derived;
  const applications = controller.derived.applications.filter(
    (app) => app.parentId === env.id,
  );
  return (
    <TabsContent value={env.id}>
      <div className="mb-4 flex justify-end">
        <Button
          disabled={!!env.data.deleting}
          variant="ghost"
          size="sm"
          data-project-action="variables"
          data-project-id={env.id}
        >
          Environment variables
        </Button>
        <Button
          disabled={!env.canWrite || !!env.data.deleting}
          variant="ghost"
          size="sm"
          data-project-action="edit"
          data-project-id={env.id}
        >
          Edit environment
        </Button>
      </div>
      {env.id === currentEnvironment?.id ? (
        <ProjectApplications
          apps={applications}
          controller={controller}
          previews={false}
        />
      ) : null}
    </TabsContent>
  );
}
