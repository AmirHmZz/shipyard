import type { Options } from "@/components/resource-forms/Options";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/translate-error";

export type RepositoryStatusProps = {
  repos: Options["repos"];
  connected: boolean;
};
export function RepositoryStatus({ repos, connected }: RepositoryStatusProps) {
  function handleButtonClick() {
    return void repos.refetch();
  }

  return (
    <>
      {" "}
      {repos.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {describeError(repos.error)}
            <Button type="button" variant="outline" onClick={handleButtonClick}>
              Retry repositories
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {connected &&
        !repos.isFetching &&
        !repos.isError &&
        repos.data?.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No repositories found. Select Other to enter one manually.
          </p>
        )}
    </>
  );
}
