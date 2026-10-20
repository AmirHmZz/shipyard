import { Anchor, ChevronDown } from "lucide-react";
import { Link, NavLink } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useResources } from "@/lib/api";

import { navigation } from "../generics";

export function Sidebar({ close }: { close?: () => void }) {
  const projectCount = useResources((resources) =>
    resources.reduce(
      (count, resource) => count + Number(resource.kind === "project"),
      0,
    ),
  );
  return (
    <div className="flex h-full flex-col">
      <Link
        to="/"
        onClick={close}
        className="my-6 flex shrink-0 items-center gap-2.5 px-6"
      >
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Anchor className="size-5" />
        </div>
        <span className="text-xl font-semibold tracking-tight text-foreground">
          shipyard<span className="text-primary">.</span>
        </span>
        <Badge
          variant="outline"
          className="ml-auto px-1.5 font-mono text-[9px] font-normal text-muted-foreground"
        >
          BETA
        </Badge>
      </Link>
      <div className="px-4">
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
      <nav className="space-y-1 px-3">
        {navigation.map((item, i) => (
          <div key={item.path}>
            {i === 3 && (
              <div className="mt-7 mb-3 px-3 font-mono text-[9px] tracking-[.17em] text-muted-foreground">
                INFRASTRUCTURE
              </div>
            )}
            {i === 7 && <Separator className="my-5" />}
            <NavLink
              to={item.path}
              prefetch="intent"
              end={item.path === "/"}
              onClick={close}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-medium transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`
              }
            >
              <item.icon className="size-4" />
              {item.label}
              {item.label === "Projects" && (
                <span className="ml-auto rounded bg-background/60 px-1.5 py-0.5 font-mono text-[9px]">
                  {projectCount.data || 0}
                </span>
              )}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="mt-auto p-4">
        <div className="flex items-center justify-between px-1 text-[9px] text-muted-foreground">
          <span className="font-mono">SHIPYARD v0.1</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-primary" />
            CONTROL PLANE
          </span>
        </div>
      </div>
    </div>
  );
}
