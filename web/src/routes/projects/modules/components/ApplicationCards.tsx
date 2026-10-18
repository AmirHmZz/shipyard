import { RepositoryName } from "@/components/repository-name";
import { Empty } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { text, type Resource } from "@/lib/api";
import { indexResources } from "@/lib/resource-index";
import { Box, FileCode2, GitBranch, Plus } from "lucide-react";
import { Link } from "react-router";
import type { EditorRequest } from "../generics";

export function ApplicationCards({
  apps,
  filter,
  previews,
  index,
  currentEnvironment,
  openEditor,
}: {
  apps: Resource[];
  filter: string;
  previews: boolean;
  index: ReturnType<typeof indexResources>;
  currentEnvironment?: Resource;
  openEditor: (request: EditorRequest) => void;
}) {
  return apps.length ? (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {apps
        .filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
        .map((r) => (
          <Link key={r.id} to={`/applications/${r.id}`}>
            <Card className="py-0 shadow-none transition-colors hover:border-primary/40">
              <CardContent className="p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/40">
                    <Box className="size-5 text-primary" />
                  </div>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {text(r.data, "engine").toUpperCase()}
                  </Badge>
                </div>
                <h3 className="font-medium">{r.name}</h3>
                {!!r.data.deleting && (
                  <Badge variant="secondary" className="mt-2">
                    {r.data.deletionError ? "Cleanup failed" : "Deleting…"}
                  </Badge>
                )}
                <p className="mt-2 truncate text-xs text-muted-foreground">
                  {text(r.data, "source") === "compose" ? (
                    "Direct Compose"
                  ) : (
                    <RepositoryName
                      repository={text(r.data, "repository")}
                      provider={text(
                        index.byId.get(text(r.data, "gitId"))?.data || {},
                        "provider",
                      )}
                    />
                  )}
                </p>
                <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {text(r.data, "source") === "compose" ? (
                      <FileCode2 className="size-3" />
                    ) : (
                      <GitBranch className="size-3" />
                    )}
                    {text(r.data, "source") === "compose"
                      ? "compose.yaml"
                      : text(r.data, "branch")}
                  </span>
                  <span>
                    {index.byId.get(text(r.data, "serverId"))?.name || "Server"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
    </div>
  ) : (
    <Empty
      title={
        previews ? "No previews yet" : "This environment is ready for an app"
      }
      description={
        previews
          ? "Enable pull request previews on an application and configure a preview domain on its server."
          : "Deploy from a Git repository or paste Compose YAML directly."
      }
      action={
        !previews && (
          <Button
            disabled={
              !currentEnvironment?.canWrite ||
              !!currentEnvironment?.data.deleting
            }
            onClick={() =>
              openEditor({
                kind: "application",
                parentId: currentEnvironment?.id,
              })
            }
          >
            <Plus />
            New application
          </Button>
        )
      }
    />
  );
}
