import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type SectionRowProps = ComponentProps<"div">;
export function SectionRow({ className, ...props }: SectionRowProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className,
      )}
      {...props}
    />
  );
}
