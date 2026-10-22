import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { QueryClientProvider } from "@tanstack/react-query";

import { createQueryClient } from "@/lib/api/query-client";

export function createTestClient() {
  const client = createQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, retry: false, gcTime: Infinity },
  });
  return client;
}

export type TestProviderProps = { children: ReactNode };
export function renderWithClient(client: QueryClient) {
  function TestProvider({ children }: TestProviderProps) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return { wrapper: TestProvider };
}
