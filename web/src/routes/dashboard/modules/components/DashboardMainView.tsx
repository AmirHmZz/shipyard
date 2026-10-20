import { Loading } from "@/components/shared";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { useSession } from "../hooks";
import { Auth } from "./Auth";
import { Shell } from "./Shell";

export function DashboardMainView() {
  const session = useSession();
  return (
    <>
      <TooltipProvider>
        {session.isPending ? (
          <div className="p-10">
            <Loading />
          </div>
        ) : session.data ? (
          <Shell session={session.data} />
        ) : (
          <Auth />
        )}
        <Toaster position="bottom-right" richColors />
      </TooltipProvider>
    </>
  );
}
