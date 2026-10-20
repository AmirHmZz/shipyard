import type { ReactNode } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import * as z from "zod/mini";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { createQueryClient } from "@/lib/api/query-client";

z.config(z.locales.en());
const client = createQueryClient();
export type AppProvidersProps = { children: ReactNode };
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={client}>
        {children}
        <Toaster position="bottom-right" richColors />
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
