import {
  Activity,
  Cloud,
  GitBranch,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import type { Resource } from "@/lib/api/types";

import { ProviderLogo } from "@/components/provider-name";
import { ErrorState, Loading, PageHeader } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useResources } from "@/lib/hooks/useResources";
import { providerName } from "@/lib/providers";
import { text } from "@/lib/resource-fields";
import { useAccount } from "@/lib/session";

export function IntegrationsMainView() {
  const navigate = useNavigate();
  const account = useAccount();
  const q = useResources();
  const openEditor = (request: { kind: string; resource?: Resource }) =>
    navigate(
      `/configure/${request.kind}/${request.resource?.id || "new"}?return=/integrations`,
    );
  const openGit = (resource?: Resource) =>
    navigate(
      `/configure/source-control/${resource?.id || "new"}?return=/integrations`,
    );
  const [params] = useSearchParams();
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const resources = q.data || [];
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Integrations"
        description="Connect the services between your repository and your domain."
      />
      <div className="space-y-6">
        {[
          {
            kind: "git",
            title: "Source control",
            desc: "GitHub Apps and self-hosted Gitea.",
            icon: GitBranch,
          },
          {
            kind: "dns",
            title: "DNS providers",
            desc: "Cloudflare and ArvanCloud.",
            icon: Cloud,
          },
          {
            kind: "webhook",
            title: "Notification webhooks",
            desc: "Signed events to your preferred service.",
            icon: Activity,
          },
        ].map((item) => (
          <section key={item.kind} aria-labelledby={`integration-${item.kind}`}>
            <Card className="gap-0 overflow-hidden pb-0 shadow-none">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 pb-5">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/50">
                    <item.icon className="size-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle
                      id={`integration-${item.kind}`}
                      className="text-base"
                    >
                      {item.title}
                    </CardTitle>
                    <CardDescription>{item.desc}</CardDescription>
                  </div>
                </div>
                <Button
                  disabled={
                    !account?.admin &&
                    !(
                      item.kind === "webhook" &&
                      resources.some((r) => r.kind === "team" && r.canWrite)
                    )
                  }
                  variant="outline"
                  onClick={() =>
                    item.kind === "git"
                      ? openGit()
                      : openEditor({ kind: item.kind })
                  }
                >
                  <Plus />
                  Add connection
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {!resources.some((r) => r.kind === item.kind) && (
                  <p className="border-t px-6 py-5 text-sm text-muted-foreground">
                    No {item.title.toLowerCase()} connections yet.
                  </p>
                )}
                <div>
                  {resources
                    .filter((r) => r.kind === item.kind)
                    .map((resource) => (
                      <div
                        key={resource.id}
                        className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-5"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="shrink-0 rounded-lg border bg-muted/50 p-2.5">
                            {resource.kind === "git" ||
                            resource.kind === "dns" ? (
                              <ProviderLogo
                                provider={text(resource.data, "provider")}
                                className="size-5"
                              />
                            ) : (
                              <Activity className="size-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium">
                              {resource.name}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {text(resource.data, "provider")
                                ? providerName(text(resource.data, "provider"))
                                : text(resource.data, "url")}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {resource.kind === "git" && (
                            <Button
                              disabled={!resource.canWrite}
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                navigate(
                                  `/configure/access/${resource.id}?return=/integrations`,
                                )
                              }
                            >
                              <Users />
                              Team access
                            </Button>
                          )}
                          <Button
                            disabled={!resource.canWrite}
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              resource.kind === "git"
                                ? openGit(resource)
                                : openEditor({ kind: resource.kind, resource })
                            }
                          >
                            Configure
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </section>
        ))}
      </div>
      <Alert className="mt-6">
        <ShieldCheck className="size-4" />
        <AlertDescription>
          GitHub Apps need repository Contents and Pull requests read
          permissions, plus push/pull_request webhooks. Gitea OAuth connections
          use read-only access; configure Gitea webhooks manually.
        </AlertDescription>
      </Alert>
      {(params.get("gitError") || params.get("gitConnected")) && (
        <Alert
          className="mt-4"
          variant={params.get("gitError") ? "destructive" : "default"}
        >
          <AlertDescription>
            {params.get("gitError") ||
              "Git connection authorized. Grant team access and, for Gitea, configure your repository webhook."}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
