import type { ReactNode } from "react";

import { ScopeContext } from "@/lib/configuration-state";

export function ConfigurationScope({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return <ScopeContext value={name}>{children}</ScopeContext>;
}
