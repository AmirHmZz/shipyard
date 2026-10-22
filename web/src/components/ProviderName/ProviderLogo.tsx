import { providerNames } from "@/lib/providers";
import { cn } from "@/lib/utils";

export type ProviderLogoProps = {
  provider: string;
  className?: string;
};

export function ProviderLogo({ provider, className }: ProviderLogoProps) {
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
