import { Layers3, Plus } from "lucide-react";

import { Empty } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { useProjectsPage } from "../hooks";

import { ProjectEnvironment } from "./ProjectEnvironment";
export type ProjectEnvironmentsProps = {
  controller: ReturnType<typeof useProjectsPage>;
};
export function ProjectEnvironments({ controller }: ProjectEnvironmentsProps) {
  const { project, environments, currentEnvironment } = controller.derived;
  const { selectEnvironment, handleProjectAction, createEnvironment } =
    controller.handlers;
  if (!environments.length)
    return (
      <Empty
        title="Create an environment"
        description="Start with production or staging. Each environment has its own applications and configuration."
        action={
          <Button
            disabled={!project?.canWrite || !!project?.data.deleting}
            onClick={createEnvironment}
          >
            <Plus />
            New environment
          </Button>
        }
      />
    );
  return (
    <Tabs
      value={currentEnvironment?.id}
      onValueChange={selectEnvironment}
      onClick={handleProjectAction}
    >
      <div className="overflow-x-auto overflow-y-hidden p-1 -m-1">
        <TabsList>
          {environments.map((env) => (
            <TabsTrigger key={env.id} value={env.id}>
              <Layers3 aria-hidden="true" />
              {env.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {environments.map((env) => (
        <ProjectEnvironment
          key={env.id}
          environment={env}
          controller={controller}
        />
      ))}
    </Tabs>
  );
}
