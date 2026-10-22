import { useOutletContext } from "react-router";

import type { Session } from "./api/types";

export function useCurrentSession(): Session {
  const session = useOutletContext<Session | undefined>();
  if (!session)
    throw new Error(
      "Session context is missing. Render this page inside the dashboard outlet.",
    );
  return session;
}
export function useAccount() {
  return useCurrentSession().user;
}
export function useAdmin() {
  return !!useCurrentSession().user.admin;
}
