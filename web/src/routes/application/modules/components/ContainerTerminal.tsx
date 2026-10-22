import { Plug, Unplug } from "lucide-react";

import { FlushCard } from "@/components/FlushCard";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "@xterm/xterm/css/xterm.css";

import { useContainerTerminal } from "../hooks/terminal";
export type ContainerTerminalProps = {
  applicationId: string;
  containers: string[];
};
export function ContainerTerminal({
  applicationId,
  containers,
}: ContainerTerminalProps) {
  const { state, derived, handlers } = useContainerTerminal(
    applicationId,
    containers,
  );
  const { container, connected, status } = state;
  const { host } = derived;
  const { selectContainer, toggleConnection } = handlers;
  return (
    <FlushCard>
      <CardHeader className="flex items-center justify-between border-b py-4">
        <div>
          <CardTitle className="text-sm">Container terminal</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Interactive access is scoped to this application and recorded in the
            audit log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={container} onValueChange={selectContainer}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Container" />
            </SelectTrigger>
            <SelectContent>
              {containers.map((id) => (
                <SelectItem key={id} value={id}>
                  {id.slice(0, 12)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={connected ? "outline" : "default"}
            disabled={!container}
            onClick={toggleConnection}
          >
            {connected ? <Unplug /> : <Plug />}
            {connected ? "Disconnect" : "Connect"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="bg-[#121a15] p-0">
        <div ref={host} className="h-[440px]" />
        {!connected && (
          <p className="px-5 pb-5 font-mono text-xs text-[#7b9274]">
            Select a container and connect to open its shell.
          </p>
        )}
        <div className="border-t border-white/10 px-4 py-2 font-mono text-[10px] text-[#7b9274]">
          {status.toUpperCase()}
        </div>
      </CardContent>
    </FlushCard>
  );
}
