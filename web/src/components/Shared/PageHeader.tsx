import type { ReactNode } from "react";

import { Fragment } from "react";
import { Link } from "react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  eyebrow?: string;
  breadcrumbs?: { label: string; to?: string }[];
  title: string;
  icon?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  breadcrumbs,
  title,
  icon,
  description,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-7 flex flex-wrap items-end justify-between gap-4",
        className,
      )}
    >
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
        <div className="flex items-center gap-3">
          {icon}
          <h1 className="min-w-0 text-[28px] font-semibold tracking-tight [overflow-wrap:anywhere]">
            {title}
          </h1>
        </div>
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
