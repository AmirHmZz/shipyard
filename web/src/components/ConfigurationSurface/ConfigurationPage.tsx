import type { ReactNode } from "react";

import { ConfigurationPageContext } from "@/lib/configuration-page-context";

export type ConfigurationPageProps = { children: ReactNode };

export function ConfigurationPage({ children }: ConfigurationPageProps) {
  return (
    <ConfigurationPageContext value={true}>{children}</ConfigurationPageContext>
  );
}
