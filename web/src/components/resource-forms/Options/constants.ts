import type { Options } from "./types";
const empty = {
  data: undefined,
  error: null,
  isFetching: false,
  isError: false,
  refetch: async () => {},
};
export const emptyOptions: Options = {
  availableZones: empty,
  services: empty,
  repos: empty,
  branches: empty,
};
