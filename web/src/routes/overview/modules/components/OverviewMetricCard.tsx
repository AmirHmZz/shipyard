import type { LucideIcon } from "lucide-react";

import { Link } from "react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export type OverviewMetricCardProps = {
  stat: {
    title: string;
    count: number;
    icon: LucideIcon;
    detail: string;
    path: string;
  };
};
export function OverviewMetricCard({ stat: s }: OverviewMetricCardProps) {
  return (
    <Link to={s.path}>
      <Card className="gap-0 shadow-none transition-colors hover:border-primary/40">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {s.title}
          </CardTitle>
          <s.icon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tracking-tight">
            {s.count.toString().padStart(2, "0")}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            {s.detail}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
