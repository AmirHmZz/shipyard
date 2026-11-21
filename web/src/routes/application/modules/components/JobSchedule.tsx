import type { Resource } from "@/lib/api/types";

import { ErrorState, Loading } from "@/components/Shared";

import { useJobSettings } from "../hooks/useJobSettings";
import { JobScheduleForm } from "./JobScheduleForm";
export type JobScheduleProps = { app: Resource };
export function JobSchedule({ app }: JobScheduleProps) {
  const settings = useJobSettings(app.id);
  if (settings.isPending) return <Loading />;
  if (!settings.data)
    return settings.error ? <ErrorState error={settings.error} /> : null;
  return <JobScheduleForm key={app.id} app={app} initial={settings.data} />;
}
