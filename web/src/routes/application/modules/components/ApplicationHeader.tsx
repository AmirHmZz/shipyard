import { Settings2 } from "lucide-react";

import type { Resource } from "@/lib/api";

import { RepositoryName } from "@/components/repository-name";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { text } from "@/lib/api";

import type { Runtime } from "../generics";

import { ApplicationDeployActions } from "./ApplicationDeployActions";

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
}: {
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
}) {
  const directCompose = app.data.source === "compose";
  return (
    <PageHeader
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
        onClick={() => openEditor(app)}
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
        onDelete={() => setDeleting(true)}
      />
    </PageHeader>
  );
}
