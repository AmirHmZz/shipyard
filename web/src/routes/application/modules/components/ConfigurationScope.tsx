import { ScopeContext } from "@/lib/configuration-state";
import type { ReactNode } from "react";

export function ConfigurationScope({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return <ScopeContext value={name}>{children}</ScopeContext>;
}
