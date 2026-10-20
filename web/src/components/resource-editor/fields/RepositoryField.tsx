import type * as React from "react";
import type { ReactNode } from "react";

import { useState } from "react";

import { InputField } from "@/components/InputField";
import { RepositoryName } from "@/components/repository-name";
import { useResourceForm } from "@/components/resource-forms/controller";
import { SelectControl } from "@/components/SelectControl";
import { Loading } from "@/components/Shared";

import type { ResourceFieldProps } from "../types";

import { RepositoryStatus } from "../fields/RepositoryStatus";

export type RepositoryFieldProps = ResourceFieldProps;
export function RepositoryField({ repos, resources }: RepositoryFieldProps) {
  function handleSelectControlValueChange(value: string) {
    setManualConnection(value === "__other__" ? gitId : null);
    update("repository", value === "__other__" ? "" : value);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    return update("repository", event.target.value);
  }

  const {
    state: { data },
    handlers: { update },
    derived: { formId },
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
        <SelectControl
          value={(manual ? "__other__" : repository) || undefined}
          onValueChange={handleSelectControlValueChange}
          options={options}
          placeholder={"Select repository"}
          disabled={!gitId}
          triggerProps={{
            id: `${formId}-repository`,
            className: "w-full",
            "aria-label": "Select repository",
          }}
        />
      )}
      <RepositoryStatus repos={repos} connected={!!gitId} />
      {manual && (
        <InputField
          label={<>Repository owner/name</>}
          labelProps={{ htmlFor: `${formId}-manual-repository` }}
          inputProps={{
            id: `${formId}-manual-repository`,
            value: repository,
            onChange: handleInputChange,
            placeholder: "owner/name",
            pattern: "[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",
            required: true,
          }}
        />
      )}
    </>
  );
}
