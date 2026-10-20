import { GitFork } from "lucide-react";

import { ProviderLogo } from "@/components/provider-name";

export function RepositoryName({
  repository,
  provider,
}: {
  repository: string;
  provider?: string;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2 align-middle">
      {provider === "github" || provider === "gitea" ? (
        <ProviderLogo provider={provider} />
      ) : (
        <GitFork aria-hidden="true" className="size-4 shrink-0" />
      )}
      <span className="truncate">{repository}</span>
    </span>
  );
}
