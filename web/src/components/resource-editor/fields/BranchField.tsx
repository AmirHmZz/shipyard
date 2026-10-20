import { useResourceForm } from "@/components/resource-forms/controller";
import { Loading } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";

import type { ResourceFieldProps } from "../types";

import { choose } from "../utils";

export function BranchField({ branches, existing }: ResourceFieldProps) {
  const {
    state: { data },
    actions: { update },
    meta: { formId },
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
        choose(
          branch,
          (value) => update("branch", value),
          options,
          "Select branch",
          !data.gitId || !data.repository || options.length === 0,
          `${formId}-branch`,
        )
      )}
      {branches.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {errorMessage(branches.error)}
            <Button
              type="button"
              variant="outline"
              onClick={() => void branches.refetch()}
            >
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
