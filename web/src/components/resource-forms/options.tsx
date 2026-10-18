import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

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
  const availableZones = useQuery({
    queryKey: ["provider-zones", parent],
    queryFn: () => api<{ id: string; name: string }[]>(`/dns/${parent}/zones`),
    enabled: open && !!parent,
    retry: false,
  });
  return children({ ...emptyOptions, availableZones });
}
function RouteOptions({ parent, open, children }: Props) {
  const services = useQuery({
    queryKey: ["application-services", parent],
    queryFn: () =>
      api<{ name: string; ignoredPorts: boolean }[]>(
        `/applications/${parent}/services`,
      ),
    enabled: open && !!parent,
    retry: false,
  });
  return children({ ...emptyOptions, services });
}
function ApplicationOptions({ data, open, children }: Props) {
  const gitId = String(data.gitId || ""),
    repository = String(data.repository || "");
  const enabled = open && data.source !== "compose" && !!gitId;
  const repos = useQuery({
    queryKey: ["repositories", gitId],
    queryFn: () => api<{ full_name: string }[]>(`/git/${gitId}/repositories`),
    enabled,
    retry: false,
  });
  const branches = useQuery({
    queryKey: ["branches", gitId, repository],
    queryFn: () =>
      api<{ name: string }[]>(
        `/git/${gitId}/branches?repository=${encodeURIComponent(repository)}`,
      ),
    enabled: enabled && !!repository,
    retry: false,
  });
  return children({ ...emptyOptions, repos, branches });
}
