import { RepositoryName } from "@/components/repository-name";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, type ReactNode } from "react";
import { useResourceForm } from "@/components/resource-forms/controller";
import { Loading } from "@/components/shared";
import type { ResourceFieldProps } from "../types";
import { choose } from "../utils";
import { RepositoryStatus } from "../fields/RepositoryStatus";

export function RepositoryField({ repos, resources }: ResourceFieldProps) {
  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();
  const gitId = String(data.gitId || "");
  const repository = String(data.repository || "");
  const provider = String(
    resources.find((r) => r.id === gitId)?.data.provider || "",
  );
  const [manualConnection, setManualConnection] = useState<string | null>(null);
  const manual =
    manualConnection === gitId ||
    (!!repository &&
      !!repos.data &&
      !repos.data.some((repo) => repo.full_name === repository));
  const options: { value: string; label: ReactNode }[] = (repos.data || []).map(
    (repo) => ({
      value: repo.full_name,
      label: <RepositoryName repository={repo.full_name} provider={provider} />,
    }),
  );
  options.push({ value: "__other__", label: "Other" });
  return (
    <>
      {repos.isFetching ? (
        <Loading label="Loading repositories…" id={`${formId}-repository`} />
      ) : (
        choose(
          manual ? "__other__" : repository,
          (value) => {
            setManualConnection(value === "__other__" ? gitId : null);
            update("repository", value === "__other__" ? "" : value);
          },
          options,
          "Select repository",
          !gitId,
          `${formId}-repository`,
        )
      )}
      <RepositoryStatus repos={repos} connected={!!gitId} />
      {manual && (
        <div className="space-y-2">
          <Label htmlFor={`${formId}-manual-repository`}>
            Repository owner/name
          </Label>
          <Input
            id={`${formId}-manual-repository`}
            value={repository}
            onChange={(event) => update("repository", event.target.value)}
            placeholder="owner/name"
            pattern="[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
            required
          />
        </div>
      )}
    </>
  );
}
