import { Spinner } from "@/components/ui/spinner";

export type LoadingProps = {
  label?: string;
  className?: string;
  id?: string;
};

export function Loading({
  label = "Loading workspace…",
  className,
  id,
}: LoadingProps) {
  return (
    <div
      id={id}
      role="status"
      aria-label={label}
      className={`flex h-9 w-full items-center justify-between gap-3 rounded-md border border-input bg-muted/60 px-3 text-sm text-muted-foreground ${className || ""}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <Spinner className="size-4 text-muted-foreground" />
    </div>
  );
}
