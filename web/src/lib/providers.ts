export const providerNames: Record<string, string> = {
  telegram: "Telegram",
  bale: "Bale",
  webhook: "Generic webhook",
  github: "GitHub",
  gitea: "Gitea",
  cloudflare: "Cloudflare",
  arvancloud: "ArvanCloud",
};

export function providerName(value: string) {
  return providerNames[value] || value;
}
