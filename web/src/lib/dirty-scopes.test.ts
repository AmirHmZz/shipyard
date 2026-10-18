import { describe, expect, it, vi } from "vitest";
import { createDirtyScopes } from "./dirty-scopes";

describe("scoped navigation protection", () => {
  it("observes saves immediately and keeps other unsaved scopes", () => {
    const store = createDirtyScopes();
    store.actions.change("networking");
    store.actions.change("ports");
    store.actions.saved("networking");
    expect(store.isDirty()).toBe(true);
    store.actions.saved("ports");
    expect(store.isDirty()).toBe(false);
  });
  it("publishes actual changes and supports subscription cleanup", () => {
    const store = createDirtyScopes();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.actions.change("form");
    store.actions.change("form");
    store.actions.saved("other");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.actions.discard();
    expect(store.isDirty()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
