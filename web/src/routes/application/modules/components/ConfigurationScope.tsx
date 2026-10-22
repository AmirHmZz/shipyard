import type { ReactNode } from "react";

import { ScopeContext } from "@/lib/configuration-state";

export type ConfigurationScopeProps = {
  name: string;
  children: ReactNode;
};
export function ConfigurationScope({
  name,
  children,
}: ConfigurationScopeProps) {
  return <ScopeContext value={name}>{children}</ScopeContext>;
}
