import type { ReactNode } from "react";

import { useEffect, useState } from "react";

import {
  useProviderZones,
  useServiceOptions,
  useRepositories,
  useBranches,
} from "@/lib/hooks";

type Result<T> = {
  data?: T[];
  error: Error | null;
  isFetching: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
};
export type Options = {
  availableZones: Result<{ id: string; name: string }>;
  services: Result<{ name: string; ignoredPorts: boolean }>;
  repos: Result<{ full_name: string }>;
  branches: Result<{ name: string }>;
};
const empty = {
  data: undefined,
  error: null,
  isFetching: false,
  isError: false,
  refetch: async () => {},
};
const emptyOptions: Options = {
  availableZones: empty,
  services: empty,
  repos: empty,
  branches: empty,
};
type Props = {
  kind: string;
  parent: string;
  data: Record<string, unknown>;
  open: boolean;
  children: (options: Options) => ReactNode;
};

/** Domain owners subscribe only to the option queries that their fields need. */
export function ResourceOptions(props: Props) {
  switch (props.kind) {
    case "zone":
      return <ZoneOptions {...props} />;
    case "route":
      return <RouteOptions {...props} />;
    case "application":
      return <ApplicationOptions {...props} />;
    default:
      return props.children(emptyOptions);
  }
}
function ZoneOptions({ parent, open, children }: Props) {
  const availableZones = useProviderZones(parent, open);
  return children({ ...emptyOptions, availableZones });
}
function RouteOptions({ parent, open, children }: Props) {
  const services = useServiceOptions(parent, open);
  return children({ ...emptyOptions, services });
}
function ApplicationOptions({ data, open, children }: Props) {
  const gitId = String(data.gitId || ""),
    repository = String(data.repository || "");
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
  return children({
    ...emptyOptions,
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
  });
}
