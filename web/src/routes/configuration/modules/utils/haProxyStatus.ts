import type { Draft, Settings } from "../generics";

export function haProxyOperation(
  settings: Settings | undefined,
  job: string | undefined,
  busy: boolean,
  localError: string,
) {
  const jobDone =
    !!job &&
    settings?.apply?.id === job &&
    ["done", "failed"].includes(settings?.apply?.state || "");
  const success = !!(
    jobDone &&
    settings?.apply?.state === "done" &&
    settings.lastJobId === job &&
    settings.version !== undefined &&
    settings.bindings
  );
  const error =
    jobDone && !success
      ? settings?.apply?.error || "HAProxy settings could not be applied."
      : localError;
  const pending =
    busy ||
    (!!job && !jobDone) ||
    (!!settings?.apply && ["queued", "running"].includes(settings.apply.state));
  return { jobDone, success, error, pending };
}
export function isStaleHAProxyDraft(
  draft: Draft | null,
  settings: Settings | undefined,
) {
  return (
    !!draft &&
    !!settings &&
    (draft.version !== settings.version ||
      Object.keys(draft.bindings).some(
        (id) => !settings.frontends.some((frontend) => frontend.id === id),
      ))
  );
}
