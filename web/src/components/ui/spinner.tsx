import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

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
