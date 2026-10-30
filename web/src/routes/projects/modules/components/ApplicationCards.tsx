import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";
import type { indexResources } from "@/lib/resource-index";

import { ResourceCardGrid } from "@/components/ResourceCardGrid";
import { Empty } from "@/components/Shared";
import { SortableResourceCard } from "@/components/SortableResourceCard";
import { Button } from "@/components/ui/button";

import type { EditorRequest } from "../generics";

import { ApplicationCard } from "./ApplicationCard";

export type ApplicationCardsProps = {
  apps: Resource[];
  filter: string;
  previews: boolean;
  index: ReturnType<typeof indexResources>;
  currentEnvironment?: Resource;
  openEditor: (request: EditorRequest) => void;
};
export function ApplicationCards({
  apps,
  filter,
  previews,
  index,
  currentEnvironment,
  openEditor,
}: ApplicationCardsProps) {
  function handleButtonClick() {
    return openEditor({
      kind: "application",
      parentId: currentEnvironment?.id,
    });
  }

  const visibleApps = apps.filter((resource) =>
    resource.name.toLowerCase().includes(filter.toLowerCase()),
  );
  return apps.length ? (
    <ResourceCardGrid resources={visibleApps}>
      {visibleApps.map((r, position) => (
        <SortableResourceCard
          key={r.id}
          resource={r}
          index={position}
          disabled={!!filter || previews}
        >
          <ApplicationCard resource={r} index={index} />
        </SortableResourceCard>
      ))}
    </ResourceCardGrid>
  ) : (
    <Empty
      title={
        previews ? "No previews yet" : "This environment is ready for an app"
      }
      description={
        previews
          ? "Enable pull request previews on an application and configure a preview domain on its server."
          : "Deploy from a Git repository or paste Compose YAML directly."
      }
      action={
        !previews && (
          <Button
            disabled={
              !currentEnvironment?.canWrite ||
              !!currentEnvironment?.data.deleting
            }
            onClick={handleButtonClick}
          >
            <Plus />
            New application
          </Button>
        )
      }
    />
  );
}
