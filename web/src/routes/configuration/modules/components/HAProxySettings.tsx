import type { Resource } from "@/lib/api/types";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ConfigurationSurface";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useHAProxyController } from "../hooks";
import { HAProxyBindings } from "./HAProxyBindings";
export type HAProxySettingsProps = {
  server: Resource;
  onOpenChange: (open: boolean) => void;
};
export function HAProxySettings({
  server,
  onOpenChange,
}: HAProxySettingsProps) {
  const controller = useHAProxyController(server);
  const { pending, saveDisabled } = controller.derived;
  const { save } = controller.handlers;
  function close() {
    onOpenChange(false);
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>HAProxy settings · {server.name}</DialogTitle>
          <DialogDescription>
            Choose listening IP addresses for each frontend. Application
            routing, certificates, and listener ports stay managed by Shipyard.
          </DialogDescription>
        </DialogHeader>
        <HAProxyBindings controller={controller} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Close
          </Button>
          <Button type="button" disabled={saveDisabled} onClick={save}>
            {pending && <Spinner className="size-4" />} Save &amp; apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
