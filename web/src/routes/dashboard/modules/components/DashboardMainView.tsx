import { TooltipProvider } from "@/components/ui/tooltip";

import { useSession } from "../hooks";
import { DashboardSession } from "./DashboardSession";
export function DashboardMainView() {
  const session = useSession();
  return (
    <>
      <TooltipProvider>
        <DashboardSession session={session} />
      </TooltipProvider>
    </>
  );
}
