import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import type { Options } from "@/components/resource-forms/options";

export function RepositoryStatus({
  repos,
  connected,
}: {
  repos: Options["repos"];
  connected: boolean;
}) {
  return (
    <>
      {" "}
      {repos.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {errorMessage(repos.error)}
            <Button
              type="button"
              variant="outline"
              onClick={() => void repos.refetch()}
            >
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
