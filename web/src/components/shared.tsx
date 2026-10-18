import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertCircle,
  ArrowUpRight,
  Box,
  Check,
  Circle,
  Copy,
  Plus,
  Search,
} from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
export function StateBadge({ state }: { state?: string }) {
  const healthy = [
    "healthy",
    "ready",
    "running",
    "connected",
    "done",
    "online",
  ].includes(state || "");
  const failed = [
    "failed",
    "recovery_failed",
    "conflict",
    "offline",
    "renewal_failed",
  ].includes(state || "");
  const pending = [
    "queued",
    "building",
    "deploying",
    "issuing",
    "pending",
  ].includes(state || "");
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 font-normal capitalize ${healthy ? "border-primary/20 bg-primary/8 text-primary" : failed ? "border-destructive/20 bg-destructive/8 text-destructive" : "bg-muted/60 text-muted-foreground"}`}
    >
      {pending ? (
        <Spinner className="size-3" />
      ) : (
        <Circle
          className={`size-1.5 ${healthy || failed ? "fill-current" : ""}`}
        />
      )}{" "}
      {(state || "not deployed").replaceAll("_", " ")}
    </Badge>
  );
}
export function PageHeader({
  eyebrow,
  breadcrumbs,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  breadcrumbs?: { label: string; to?: string }[];
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-full">
        {breadcrumbs?.length ? (
          <Breadcrumb className="mb-2">
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => (
                <Fragment
                  key={JSON.stringify(
                    breadcrumbs
                      .slice(0, index + 1)
                      .map(({ to, label }) => to || label),
                  )}
                >
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem className="min-w-0">
                    {crumb.to ? (
                      <BreadcrumbLink
                        asChild
                        className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <Link to={crumb.to}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="[overflow-wrap:anywhere]">
                        {crumb.label}
                      </BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        ) : (
          eyebrow && (
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">
              {eyebrow}
            </div>
          )
        )}
        <h1 className="text-[28px] font-semibold tracking-tight [overflow-wrap:anywhere]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="border-dashed bg-card/60 py-0 shadow-none">
      <CardContent className="flex min-h-60 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border bg-background text-muted-foreground">
          {icon || <Box className="size-5" />}
        </div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-2 mb-5 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {action}
      </CardContent>
    </Card>
  );
}
export function ErrorState({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertDescription>
        {error instanceof Error ? error.message : "Something went wrong"}
      </AlertDescription>
    </Alert>
  );
}
export function Loading({
  label = "Loading workspace…",
  className,
  id,
}: {
  label?: string;
  className?: string;
  id?: string;
}) {
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
export function Filter({
  value,
  onChange,
  placeholder = "Filter by name…",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative max-w-xs">
      <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
      <Input
        className="h-10 bg-card pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Clipboard is unavailable");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  destructive = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  destructive?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Operation failed",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Spinner className="size-4 " />}Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick}>
      <Plus className="size-4" />
      {children}
    </Button>
  );
}
export function ExternalLink({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  return (
    <a
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <ArrowUpRight className="size-3.5" />
    </a>
  );
}
