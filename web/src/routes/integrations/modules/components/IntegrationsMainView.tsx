import {
  Activity,
  Cloud,
  GitBranch,
  ShieldCheck,
  Container,
} from "lucide-react";

import { Confirm, ErrorState, Loading, PageHeader } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { useIntegrationsPage } from "../hooks";
import { IntegrationSection } from "./IntegrationSection";
const sections = [
  {
    kind: "proxy",
    title: "SOCKS proxies",
    desc: "Reusable SOCKS5 and SOCKS5H connections for certificates, DNS and notifications.",
    icon: ShieldCheck,
  },
  {
    kind: "registry",
    title: "Container registries",
    desc: "Credentials are matched automatically to image hosts for granted teams.",
    icon: Container,
  },
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
    title: "Notifications",
    desc: "Telegram, Bale and signed notification webhooks.",
    icon: Activity,
  },
];
export function IntegrationsMainView() {
  const { derived, handlers } = useIntegrationsPage();
  const {
    account,
    q,
    resources,
    gitMessage,
    showGitMessage,
    gitFailed,
    deletingRegistry,
    deletionPending,
  } = derived;
  const { handleIntegrationAction, closeDeletion, confirmDeletion } = handlers;
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
        {sections
          .filter((item) => item.kind !== "proxy" || account?.admin)
          .map((item) => (
            <IntegrationSection
              key={item.kind}
              item={item}
              resources={resources}
              admin={!!account?.admin}
            />
          ))}
      </div>
      <Confirm
        open={!!deletingRegistry}
        onOpenChange={closeDeletion}
        title="Delete integration?"
        description={`Remove ${deletingRegistry?.name || "this connection"} and its stored credentials. Referenced connections must be removed from their consumers first.`}
        pending={deletionPending}
        destructive
        onConfirm={confirmDeletion}
      />
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
