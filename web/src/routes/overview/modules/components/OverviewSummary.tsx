import { Box, GitBranch, Layers3, Server } from "lucide-react";

import { OverviewMetricCard } from "./OverviewMetricCard";
export type OverviewSummaryProps = {
  projects: number;
  apps: number;
  servers: number;
  previews: number;
};
export function OverviewSummary({
  projects,
  apps,
  servers,
  previews,
}: OverviewSummaryProps) {
  return (
    <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        {
          title: "Projects",
          count: projects,
          icon: Layers3,
          detail: "Organized, from the start",
          path: "/projects",
        },
        {
          title: "Applications",
          count: apps,
          icon: Box,
          detail: "Dockerfile & Compose",
          path: "/projects",
        },
        {
          title: "Connected servers",
          count: servers,
          icon: Server,
          detail: "Independent Docker hosts",
          path: "/servers",
        },
        {
          title: "Preview environments",
          count: previews,
          icon: GitBranch,
          detail: "A space for every pull request",
          path: "/previews",
        },
      ].map((s) => (
        <OverviewMetricCard key={s.title} stat={s} />
      ))}
    </div>
  );
}
