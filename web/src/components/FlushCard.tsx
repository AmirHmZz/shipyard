import type { ComponentProps } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type FlushCardProps = ComponentProps<typeof Card>;
export function FlushCard({ className, ...props }: FlushCardProps) {
  return (
    <Card
      className={cn("gap-0 overflow-hidden py-0 shadow-none", className)}
      {...props}
    />
  );
}
