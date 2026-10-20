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
export type Props = {
  kind: string;
  parent: string;
  data: Record<string, unknown>;
  open: boolean;
  children: ReactNode;
};
