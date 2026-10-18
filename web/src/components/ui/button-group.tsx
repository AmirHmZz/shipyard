import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function ButtonGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "inline-flex w-fit items-stretch [&>button]:relative [&>button]:focus-visible:z-10 [&>button:not(:first-child)]:rounded-l-none [&>button:not(:last-child)]:rounded-r-none",
        className,
      )}
      {...props}
    />
  );
}
