import { Activity, Cloud, GitBranch, ShieldCheck } from "lucide-react";

import { ErrorState, Loading, PageHeader } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { useIntegrationsPage } from "../hooks";
import { IntegrationSection } from "./IntegrationSection";
const sections = [
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
];
export function IntegrationsMainView() {
  const { derived, handlers } = useIntegrationsPage();
  const { account, q, resources, gitMessage, showGitMessage, gitFailed } =
    derived;
  const { handleIntegrationAction } = handlers;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Integrations"
        description="Connect the services between your repository and your domain."
      />
      <div className="flex flex-col gap-6" onClick={handleIntegrationAction}>
        {sections.map((item) => (
          <IntegrationSection
            key={item.kind}
            item={item}
            resources={resources}
            admin={!!account?.admin}
          />
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
      {showGitMessage && (
        <Alert className="mt-4" variant={gitFailed ? "destructive" : "default"}>
          <AlertDescription>{gitMessage}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
