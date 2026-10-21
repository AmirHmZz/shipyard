import { ExternalLink, RefreshCw } from "lucide-react";

import { StateBadge } from "@/components/Shared";
import { Button } from "@/components/ui/button";

import type { State } from "../generics";

export type DashboardAccessStatusProps = {
  state: State;
  busy: boolean;
  retry: () => void;
};

export function DashboardAccessStatus({
  state,
  busy,
  retry,
}: DashboardAccessStatusProps) {
  return (
    <section className="flex flex-col gap-4 border-t pt-5">
      <p className="font-medium break-all">{state.domain}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(["dns", "propagation", "certificate", "routing"] as const).map(
          (key) => (
            <div key={key}>
              <p className="mb-2 text-xs capitalize text-muted-foreground">
                {key}
              </p>
              <StateBadge state={state.status?.[key] || "pending"} />
            </div>
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={busy} onClick={retry}>
          <RefreshCw />
          Retry setup
        </Button>
        <Button variant="outline" asChild>
          <a
            href={state.candidateOrigin + "/settings?tab=dashboard"}
            target="_blank"
            rel="noreferrer"
          >
            Open dashboard
            <ExternalLink />
          </a>
        </Button>
      </div>
    </section>
  );
}
