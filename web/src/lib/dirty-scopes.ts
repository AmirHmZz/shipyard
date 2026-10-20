/** Scoped edits are synchronous so navigation can observe a just-completed save. */
export function createDirtyScopes() {
  const scopes = new Set<string>();
  const listeners = new Set<() => void>();
  function notify() {
    return listeners.forEach((listener) => listener());
  }
  return {
    isDirty: () => scopes.size > 0,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    actions: {
      change(scope: string) {
        if (scopes.has(scope)) return;
        scopes.add(scope);
        notify();
      },
      saved(scope: string) {
        if (scopes.delete(scope)) notify();
      },
      discard() {
        if (!scopes.size) return;
        scopes.clear();
        notify();
      },
    },
  };
}
