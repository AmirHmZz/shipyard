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
} from "lucide-react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Resource } from "@/lib/api";
import { loadComposeEditor } from "@/lib/feature-loaders";

export function ApplicationTabList({
  app,
  directCompose,
}: {
  app: Resource;
  directCompose: boolean;
}) {
  return (
    <div className="overflow-x-auto overflow-y-hidden p-1 -m-1">
      <TabsList>
        {[
          { value: "overview", icon: LayoutDashboard },
          ...(directCompose && app.canWrite
            ? [{ value: "compose", icon: FileCode2 }]
            : []),
          { value: "deployments", icon: History },
          { value: "domains", icon: Globe2 },
          { value: "variables", icon: SlidersHorizontal },
          { value: "networking", icon: Network },
          { value: "volumes", icon: HardDrive },
          ...(!directCompose && !app.data.previewOf
            ? [{ value: "previews", icon: GitBranch }]
            : []),
          { value: "logs", icon: ScrollText },
          { value: "terminal", icon: Terminal },
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
    </div>
  );
}
