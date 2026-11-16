import type { MouseEvent } from "react";

import { Globe2, Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { SettingsHeading } from "@/components/SettingsHeading";
import { Empty } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { useAdmin } from "@/lib/session";

import { RouteCard } from "./RouteCard";

export type ApplicationDomainsProps = {
  app: Resource;
  routes: Resource[];
  openEditor: (resource: Resource | "new") => void;
  setConfirmAction: (action: string) => void;
};
export function ApplicationDomains({
  app,
  routes,
  openEditor,
  setConfirmAction,
}: ApplicationDomainsProps) {
  const admin = useAdmin();
  function handleRouteAction(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-route-id]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    const route = routes.find((route) => route.id === button.dataset.routeId);
    if (!route) return;
    if (button.dataset.routeAction === "edit") openEditor(route);
    if (button.dataset.routeAction === "delete")
      setConfirmAction("delete:" + route.id);
  }
  function handleButtonClick() {
    return openEditor("new");
  }

  return (
    <TabsContent value="domains" className="flex flex-col gap-6">
      <SettingsHeading
        title="Domains & routes"
        description="Connect an address to your application and monitor its DNS, certificate, and routing status."
        action={
          <Button disabled={!app.canWrite} onClick={handleButtonClick}>
            <Plus />
            Add route
          </Button>
        }
      />
      <div className="flex items-center gap-2 text-sm font-medium">
        <Globe2 className="size-4 text-muted-foreground" />
        Connected routes
        <Badge variant="secondary">{routes.length}</Badge>
      </div>
      <div className="flex flex-col gap-4" onClick={handleRouteAction}>
        {routes.length ? (
          routes.map((route) => (
            <RouteCard
              key={route.id}
              route={{ ...route, canWrite: route.canWrite && app.canWrite }}
              canReplaceDNSRecords={admin}
            />
          ))
        ) : (
          <Empty
            icon={<Globe2 className="size-5" />}
            title="Give your application an address"
            description="Add a domain or a TCP listener. Managed zones create DNS records and obtain certificates automatically."
          />
        )}
      </div>
    </TabsContent>
  );
}
