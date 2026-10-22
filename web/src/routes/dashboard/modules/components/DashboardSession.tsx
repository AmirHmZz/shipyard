import { Loading } from "@/components/Shared";

import type { useSession } from "../hooks";

import { Auth } from "./Auth";
import { Shell } from "./Shell";

export type DashboardSessionProps = { session: ReturnType<typeof useSession> };
export function DashboardSession({ session }: DashboardSessionProps) {
  if (session.isPending)
    return (
      <div className="p-10">
        <Loading />
      </div>
    );
  if (session.data) return <Shell session={session.data} />;
  return <Auth />;
}
