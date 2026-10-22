import { providerName } from "@/lib/providers";

import { ProviderLogo } from "./ProviderLogo";

export type ProviderNameProps = { provider: string };

export function ProviderName({ provider }: ProviderNameProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <ProviderLogo provider={provider} />
      <span>{providerName(provider)}</span>
    </span>
  );
}
