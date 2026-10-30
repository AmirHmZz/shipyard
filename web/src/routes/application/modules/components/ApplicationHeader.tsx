import { Settings2 } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { RepositoryName } from "@/components/repository-name";
import { ResourceLogo } from "@/components/ResourceLogo";
import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { text } from "@/lib/resource-fields";

import type { Runtime } from "../generics";

import { ApplicationDeployActions } from "./ApplicationDeployActions";

export type ApplicationHeaderProps = {
  app: Resource;
  provider: string;
  project?: Resource;
  environment?: Resource;
  runtime: { data?: Runtime };
  busy: boolean;
  deploy: (
    fresh?: boolean,
    confirmName?: string,
    onSuccess?: () => void,
  ) => void;
  deployError: string;
  resetDeploy: () => void;
  openEditor: (resource: Resource | "new") => void;
  setConfirmAction: (action: string) => void;
  setDeleting: (value: boolean) => void;
};
export function ApplicationHeader({
  app,
  provider,
  project,
  environment,
  runtime,
  busy,
  deploy,
  deployError,
  resetDeploy,
  openEditor,
  setConfirmAction,
  setDeleting,
}: ApplicationHeaderProps) {
  function handleButtonClick() {
    return openEditor(app);
  }
  function handleApplicationDeployActionsDelete() {
    return setDeleting(true);
  }

  const directCompose = app.data.source === "compose";
  return (
    <PageHeader
      icon={<ResourceLogo resource={app} />}
      breadcrumbs={[
        { label: "Projects", to: "/projects" },
        ...(project
          ? [{ label: project.name, to: `/projects/${project.id}` }]
          : []),
        ...(environment && project
          ? [
              {
                label: environment.name,
                to: `/projects/${project.id}?environment=${environment.id}`,
              },
            ]
          : []),
        { label: app.name },
      ]}
      title={app.name}
      description={
        directCompose ? (
          "Direct Docker Compose deployment"
        ) : (
          <RepositoryName
            repository={text(app.data, "repository")}
            provider={provider}
          />
        )
      }
    >
      <Button
        disabled={!app.canWrite}
        variant="outline"
        onClick={handleButtonClick}
      >
        <Settings2 />
        Configure
      </Button>
      <ApplicationDeployActions
        app={app}
        runtime={runtime.data}
        busy={busy}
        deploy={deploy}
        deployError={deployError}
        resetDeploy={resetDeploy}
        onAction={setConfirmAction}
        onDelete={handleApplicationDeployActionsDelete}
      />
    </PageHeader>
  );
}
