import type { Resource } from "@/lib/api/types";

import type { useProjectsPage } from "../hooks";

import { ApplicationCards } from "./ApplicationCards";
export type ProjectApplicationsProps = {
  apps: Resource[];
  controller: ReturnType<typeof useProjectsPage>;
  previews: boolean;
};
export function ProjectApplications({
  apps,
  controller,
  previews,
}: ProjectApplicationsProps) {
  const { filter } = controller.state;
  const { index, currentEnvironment } = controller.derived;
  const { openEditor } = controller.handlers;
  return (
    <ApplicationCards
      apps={apps}
      filter={filter}
      previews={previews}
      index={index}
      currentEnvironment={currentEnvironment}
      openEditor={openEditor}
    />
  );
}
