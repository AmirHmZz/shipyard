import { useResourceForm } from "@/components/resource-forms/controller";
import { SelectControl } from "@/components/SelectControl";
import { Loading } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/translate-error";

import type { ResourceFieldProps } from "../types";

export type BranchFieldProps = ResourceFieldProps;
export function BranchField({ branches, existing }: BranchFieldProps) {
  function handleSelectControlValueChange(value: string) {
    return update("branch", value);
  }

  function handleButtonClick() {
    return void branches.refetch();
  }

  const {
    state: { data },
    handlers: { update },
    derived: { formId },
  } = useResourceForm();
  const branch = String(data.branch || "");
  const options = (branches.data || []).map((value) => ({
    value: value.name,
    label: value.name,
  }));
  const savedBranch =
    existing?.data.gitId === data.gitId &&
    existing?.data.repository === data.repository
      ? String(existing?.data.branch || "")
      : "";
  if (savedBranch && !options.some((option) => option.value === savedBranch))
    options.unshift({ value: savedBranch, label: savedBranch });
  return (
    <>
      {branches.isFetching ? (
        <Loading label="Loading branches…" id={`${formId}-branch`} />
      ) : (
        <SelectControl
          value={branch || undefined}
          onValueChange={handleSelectControlValueChange}
          options={options}
          placeholder={"Select branch"}
          disabled={!data.gitId || !data.repository || options.length === 0}
          triggerProps={{
            id: `${formId}-branch`,
            className: "w-full",
            "aria-label": "Select branch",
          }}
        />
      )}
      {branches.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {describeError(branches.error)}
            <Button type="button" variant="outline" onClick={handleButtonClick}>
              Retry branches
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {branches.data?.length === 0 &&
        !branches.isFetching &&
        !branches.isError && (
          <p className="text-xs text-muted-foreground">
            No branches found in this repository.
          </p>
        )}
    </>
  );
}
