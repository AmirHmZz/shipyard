import { Anchor, ChevronDown, Info } from "lucide-react";
import { Link, NavLink } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBuildInfo } from "@/lib/hooks/useBuildInfo";
import { useResources } from "@/lib/hooks/useResources";
import { formatBuildVersion } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

import { navigation } from "../generics";

export type SidebarProps = {
  close?: () => void;
  collapsed?: boolean;
  admin: boolean;
};
export function Sidebar({ close, collapsed = false, admin }: SidebarProps) {
  const build = useBuildInfo();
  const version = formatBuildVersion(
    build.error ? undefined : build.data?.version,
  );
  const versionLabel = version ? `SHIPYARD ${version}` : "SHIPYARD";
  const projectCount = useResources((resources) =>
    resources.reduce(
      (count, resource) => count + Number(resource.kind === "project"),
      0,
    ),
  );
  return (
    <div
      className="group/sidebar flex h-full flex-col"
      data-collapsed={collapsed}
    >
      <Link
        to="/"
        onClick={close}
        aria-label="Shipyard overview"
        className={cn(
          "my-6 flex shrink-0 items-center gap-2.5",
          collapsed ? "justify-center px-0" : "px-6",
        )}
      >
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Anchor className="size-5" />
        </div>
        <span
          className={cn(
            "text-xl font-semibold tracking-tight text-foreground",
            collapsed && "sr-only",
          )}
        >
          shipyard<span className="text-primary">.</span>
        </span>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto px-1.5 font-mono text-[9px] font-normal text-muted-foreground",
            collapsed && "hidden",
          )}
        >
          BETA
        </Badge>
      </Link>
      <div className={cn("px-4", collapsed && "hidden")}>
        <div className="mb-7 flex items-center gap-2.5 rounded-lg border bg-card/70 p-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-medium text-primary">
            S
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">
              Deployment workspace
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Self-hosted
            </p>
          </div>
          <ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
        </div>
      </div>
      <nav
        aria-label="Main navigation"
        className={cn("flex flex-col gap-1", collapsed ? "px-2" : "px-3")}
      >
        {navigation
          .filter((item) => !item.adminOnly || admin)
          .map((item, i) => (
            <div key={item.path}>
              {i === 3 && (
                <div
                  className={cn(
                    "mt-6 mb-3 px-3 font-mono text-[9px] tracking-[.17em] text-muted-foreground",
                    collapsed && "sr-only",
                  )}
                >
                  INFRASTRUCTURE
                </div>
              )}
              {item.path === "/teams" && <Separator className="mt-4 mb-5" />}
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.path}
                    prefetch="intent"
                    end={item.path === "/"}
                    onClick={close}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary aria-[current=page]:hover:bg-primary/10 aria-[current=page]:hover:text-primary group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0"
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className={collapsed ? "sr-only" : undefined}>
                      {item.label}
                    </span>
                    {item.label === "Projects" && !collapsed && (
                      <span className="ml-auto rounded bg-background/60 px-1.5 py-0.5 font-mono text-[9px]">
                        {projectCount.data || 0}
                      </span>
                    )}
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className={collapsed ? undefined : "hidden"}
                >
                  {item.label}
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
      </nav>
      <div
        className={cn("mt-auto", collapsed ? "flex justify-center p-2" : "p-4")}
      >
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={versionLabel}>
                <Info className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{versionLabel}</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center justify-between px-1 text-[9px] text-muted-foreground">
            <span className="font-mono">{versionLabel}</span>
            <span className="flex items-center gap-1.5">
              <span className="size-1 rounded-full bg-primary" />
              CONTROL PLANE
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
