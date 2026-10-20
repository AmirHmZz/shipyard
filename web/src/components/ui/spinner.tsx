import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      data-slot="spinner"
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 animate-spin motion-reduce:animate-none",
        className,
      )}
    >
      <Loader2 className="size-full" />
    </span>
  );
}
