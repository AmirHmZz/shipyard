import type { Session } from "@/lib/api";
import { Settings } from "@/pages/settings";
import { useOutletContext } from "react-router";

export default function SettingsRoute() {
  const session = useOutletContext<Session>();
  return <Settings session={session} />;
}
