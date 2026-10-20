import type { ReactNode } from "react";

import { Confirm } from "@/components/Shared";
import { ConfigurationContext } from "@/lib/configuration-state";
import { useConfigurationGuard } from "@/lib/hooks/useConfigurationGuard";
import { cn } from "@/lib/utils";

export type ConfigurationGuardProps = {
  children: ReactNode;
  className?: string;
};

export function ConfigurationGuard({
  children,
  className,
}: ConfigurationGuardProps) {
  const { derived, handlers } = useConfigurationGuard();
  const { context, blocked } = derived;
  const { handleOpenChange, discardChanges } = handlers;
  return (
    <ConfigurationContext value={context}>
      <div
        className={cn("mx-auto w-full max-w-4xl space-y-7 pb-10", className)}
      >
        {children}
        <Confirm
          open={blocked}
          onOpenChange={handleOpenChange}
          title="Discard unsaved changes?"
          description="Your unsaved configuration will be lost."
          onConfirm={discardChanges}
        />
      </div>
    </ConfigurationContext>
  );
}
