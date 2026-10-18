import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 animate-spin", className)}
    >
      <Loader2 className="size-full" />
    </span>
  );
}
