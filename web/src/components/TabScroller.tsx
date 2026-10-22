import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type TabScrollerProps = ComponentProps<"div">;
export function TabScroller({ className, ...props }: TabScrollerProps) {
  return (
    <div
      className={cn("overflow-x-auto overflow-y-hidden p-1 -m-1", className)}
      {...props}
    />
  );
}
