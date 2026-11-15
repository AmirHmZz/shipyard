import type { Resource } from "@/lib/api/types";

import { ErrorState, Loading } from "@/components/Shared";

import { useApplicationAutomation } from "../hooks/useApplicationAutomation";
import { useApplicationServices } from "../hooks/useApplicationServices";
import { AutomationForm } from "./AutomationForm";

export type ApplicationAutomationProps = { app: Resource };
export function ApplicationAutomation({ app }: ApplicationAutomationProps) {
  const query = useApplicationAutomation(app.id);
  const services = useApplicationServices(app);
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  const status = query.data;
  return (
    <div className="flex flex-col gap-5">
      {services.error && <ErrorState error={services.error} />}
      {status.lastResult && (
        <p role="status">
          Last action: {status.lastAction} · {status.lastResult}
          {status.lastAt && ` · ${new Date(status.lastAt).toLocaleString()}`}
        </p>
      )}
      {status.lastError && <p role="alert">{status.lastError}</p>}
      {status.restartStatus.map((item) => (
        <p className="text-sm" key={`${item.service}:${item.container}`}>
          {item.service} · {item.container.slice(0, 12)} · {item.state}
          {item.nextDue &&
            ` · Next restart: ${new Date(item.nextDue).toLocaleString()}`}
        </p>
      ))}
      {status.rules
        .filter((rule) => rule.enabled)
        .map((rule) => (
          <p className="text-sm" key={rule.id}>
            {rule.action} · {rule.timezone} · Next:{" "}
            {(status.upcoming[rule.id] || [])
              .map((at) =>
                new Date(at).toLocaleString(undefined, {
                  timeZone: rule.timezone,
                  timeZoneName: "short",
                }),
              )
              .join(", ")}
          </p>
        ))}
      <AutomationForm
        key={app.id}
        app={app}
        initial={status}
        services={
          services.data
            ? services.data.map((service) => service.name)
            : status.restarts.map((policy) => policy.service)
        }
      />
    </div>
  );
}
