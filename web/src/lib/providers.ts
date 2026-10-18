export const providerNames: Record<string, string> = {
  github: "GitHub",
  gitea: "Gitea",
  cloudflare: "Cloudflare",
  arvancloud: "ArvanCloud",
};

export function providerName(value: string) {
  return providerNames[value] || value;
}
