import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";
import type { indexResources } from "@/lib/resource-index";

import { Empty } from "@/components/Shared";
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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visibleApps.map((r) => (
        <ApplicationCard key={r.id} resource={r} index={index} />
      ))}
    </div>
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
