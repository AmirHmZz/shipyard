import { useEffect, useState } from "react";

import { useBranches } from "./useBranches";
import { useRepositories } from "./useRepositories";

export function useApplicationOptions(
  data: Record<string, unknown>,
  open: boolean,
) {
  const gitId = String(data.gitId || "");
  const repository = String(data.repository || "");
  const enabled = open && data.source !== "compose" && !!gitId;
  const [settledRepository, setSettledRepository] = useState(repository);
  useEffect(() => {
    const timer = setTimeout(() => setSettledRepository(repository), 300);
    return () => clearTimeout(timer);
  }, [repository]);
  const validRepository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository);
  const repos = useRepositories(gitId, enabled);
  const branches = useBranches(
    gitId,
    repository,
    enabled && validRepository && repository === settledRepository,
  );
  return {
    state: {},
    derived: {
      repos,
      branches: {
        error: branches.error,
        isError: branches.isError,
        refetch: branches.refetch,
        data:
          validRepository && repository === settledRepository
            ? branches.data
            : undefined,
        isFetching:
          branches.isFetching ||
          (enabled && validRepository && repository !== settledRepository),
      },
    },
    handlers: {},
  };
}
