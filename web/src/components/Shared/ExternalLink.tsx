import type { ReactNode } from "react";

import { ArrowUpRight } from "lucide-react";

export type ExternalLinkProps = {
  url: string;
  children: ReactNode;
};

export function ExternalLink({ url, children }: ExternalLinkProps) {
  return (
    <a
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <ArrowUpRight className="size-3.5" />
    </a>
  );
}
