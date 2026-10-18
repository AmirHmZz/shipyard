import { cn } from "@/lib/utils";

import { providerName, providerNames } from "@/lib/providers";

export function ProviderLogo({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  if (!providerNames[provider]) return null;
  return (
    <img
      src={`/brands/${provider}.svg`}
      alt=""
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 object-contain",
        provider === "github" && "dark:invert",
        className,
      )}
    />
  );
}

export function ProviderName({ provider }: { provider: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <ProviderLogo provider={provider} />
      <span>{providerName(provider)}</span>
    </span>
  );
}
