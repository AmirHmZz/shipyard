import {
  FileCode2,
  HardDrive,
  GitBranch,
  Globe2,
  History,
  LayoutDashboard,
  Network,
  SlidersHorizontal,
  ScrollText,
  Terminal,
  Clock,
  ListChecks,
} from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { TabScroller } from "@/components/TabScroller";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usesInlineCompose } from "@/lib/compose-source";
import { loadComposeEditor } from "@/lib/feature-loaders";

export type ApplicationTabListProps = {
  app: Resource;
  directCompose: boolean;
};
export function ApplicationTabList({
  app,
  directCompose,
}: ApplicationTabListProps) {
  return (
    <TabScroller>
      <TabsList>
        {[
          { value: "overview", icon: LayoutDashboard },
          ...(usesInlineCompose(app.data) && app.canWrite
            ? [{ value: "compose", icon: FileCode2 }]
            : []),
          { value: "deployments", icon: History },
          ...(app.data.workload === "job"
            ? [
                { value: "runs", icon: ListChecks },
                { value: "schedule", icon: Clock },
              ]
            : [{ value: "domains", icon: Globe2 }]),
          { value: "variables", icon: SlidersHorizontal },
          { value: "networking", icon: Network },
          { value: "volumes", icon: HardDrive },
          ...(!directCompose &&
          !app.data.previewOf &&
          app.data.workload !== "job"
            ? [{ value: "previews", icon: GitBranch }]
            : []),
          ...(app.data.workload === "job"
            ? []
            : [
                { value: "logs", icon: ScrollText },
                { value: "terminal", icon: Terminal },
              ]),
        ].map(({ value: t, icon: Icon }) => (
          <TabsTrigger
            disabled={t === "terminal" && !app.canWrite}
            key={t}
            value={t}
            className="capitalize"
            onMouseEnter={
              t === "compose"
                ? () => void loadComposeEditor().catch(() => {})
                : undefined
            }
            onFocus={
              t === "compose"
                ? () => void loadComposeEditor().catch(() => {})
                : undefined
            }
          >
            <Icon aria-hidden="true" />
            {t}
          </TabsTrigger>
        ))}
      </TabsList>
    </TabScroller>
  );
}
