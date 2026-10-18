import { createContext, use, useMemo } from "react";

export type ConfigurationState = {
  state: { dirty: boolean };
  actions: {
    change: (scope: string) => void;
    saved: (scope: string) => void;
    discard: () => void;
  };
};

export const ConfigurationContext = createContext<ConfigurationState | null>(
  null,
);
export const ScopeContext = createContext("form");
const noop = () => {};

export function useConfigurationChanges(scope?: string) {
  const context = use(ConfigurationContext);
  const inheritedScope = use(ScopeContext);
  const key = scope ?? inheritedScope;
  const actions = context?.actions;
  return useMemo(
    () => ({
      change: () => actions?.change(key),
      saved: () => actions?.saved(key),
      discard: actions?.discard ?? noop,
    }),
    [actions, key],
  );
}
