import { MoreHorizontal, Trash2 } from "lucide-react";
import { Link } from "react-router";

import type { Resource } from "@/lib/api/types";
import type { indexResources } from "@/lib/resource-index";

import { ResourceLogo } from "@/components/ResourceLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
export type ProjectCardProps = {
  project: Resource;
  index: ReturnType<typeof indexResources>;
};
export function ProjectCard({ project: p, index }: ProjectCardProps) {
  const environmentCount = (index.byParent.get(p.id) || []).filter(
    (resource) => resource.kind === "environment",
  ).length;
  return (
    <Card className="group relative gap-0 py-0 shadow-none transition-colors hover:border-primary/40 focus-within:border-primary/40">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <ResourceLogo resource={p} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Project actions"
                className="relative z-10"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                disabled={!p.canWrite || !!p.data.deleting}
                data-project-action="edit"
                data-project-id={p.id}
              >
                Edit project
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={
                  !p.canWrite ||
                  (!!p.data.deleting && p.data.deletionRoot !== p.id)
                }
                data-project-action="delete"
                data-project-id={p.id}
              >
                <Trash2 />
                {p.data.deleting ? "Retry deletion" : "Delete project"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Link
          className="font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-primary"
          to={`/projects/${p.id}`}
        >
          {p.name}
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          {index.byId.get(p.teamId || "")?.name}
        </p>
        {!!p.data.deleting && (
          <Badge variant="secondary" className="mt-2">
            {p.data.deletionError ? "Cleanup failed" : "Deleting…"}
          </Badge>
        )}
        <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          {environmentCount} environments
        </div>
      </CardContent>
    </Card>
  );
}
