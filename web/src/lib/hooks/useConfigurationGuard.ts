import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useBeforeUnload, useBlocker } from "react-router";

import { createDirtyScopes } from "@/lib/dirty-scopes";

export function useConfigurationGuard() {
  const store = useMemo(() => createDirtyScopes(), []);
  const dirty = useSyncExternalStore(
    store.subscribe,
    store.isDirty,
    store.isDirty,
  );
  const blocker = useBlocker(useCallback(() => store.isDirty(), [store]));
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty) event.preventDefault();
      },
      [dirty],
    ),
  );
  const actions = store.actions;
  const context = useMemo(
    () => ({ state: { dirty }, actions }),
    [dirty, actions],
  );
  const blocked = blocker.state === "blocked";
  function handleOpenChange(open: boolean) {
    if (!open && blocker.state === "blocked") blocker.reset();
  }
  function discardChanges() {
    actions.discard();
    if (blocker.state === "blocked") blocker.proceed();
  }
  return {
    state: {},
    derived: { context, blocked },
    handlers: { handleOpenChange, discardChanges },
  };
}
