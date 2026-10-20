import type { ComponentProps, ReactNode } from "react";

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useBeforeUnload, useBlocker } from "react-router";

import { Confirm } from "@/components/shared";
import * as Modal from "@/components/ui/dialog";
import { ConfigurationContext } from "@/lib/configuration-state";
import { createDirtyScopes } from "@/lib/dirty-scopes";
import { cn } from "@/lib/utils";
const PageContext = createContext(false);
export function ConfigurationPage({ children }: { children: ReactNode }) {
  return <PageContext value={true}>{children}</PageContext>;
}
export function Dialog({
  children,
  ...props
}: ComponentProps<typeof Modal.Dialog>) {
  return use(PageContext) ? (
    props.open === false ? null : (
      <section>{children}</section>
    )
  ) : (
    <Modal.Dialog {...props}>{children}</Modal.Dialog>
  );
}
export function DialogContent({
  children,
  className,
  ...props
}: ComponentProps<typeof Modal.DialogContent>) {
  return use(PageContext) ? (
    <div className="space-y-6">{children}</div>
  ) : (
    <Modal.DialogContent className={className} {...props}>
      {children}
    </Modal.DialogContent>
  );
}
export function ConfigurationGuard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [store] = useState(createDirtyScopes);
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
  return (
    <ConfigurationContext value={context}>
      <div
        className={cn("mx-auto w-full max-w-4xl space-y-7 pb-10", className)}
      >
        {children}
        <Confirm
          open={blocker.state === "blocked"}
          onOpenChange={(open) => {
            if (!open && blocker.state === "blocked") blocker.reset();
          }}
          title="Discard unsaved changes?"
          description="Your unsaved configuration will be lost."
          onConfirm={async () => {
            actions.discard();
            if (blocker.state === "blocked") blocker.proceed();
          }}
        />
      </div>
    </ConfigurationContext>
  );
}
export function DialogHeader(props: ComponentProps<typeof Modal.DialogHeader>) {
  return use(PageContext) ? (
    <header {...props} className="space-y-3" />
  ) : (
    <Modal.DialogHeader {...props} />
  );
}
export function DialogTitle(props: ComponentProps<typeof Modal.DialogTitle>) {
  return use(PageContext) ? (
    <h1 {...props} className="text-3xl font-semibold tracking-tight" />
  ) : (
    <Modal.DialogTitle {...props} />
  );
}
export function DialogDescription(
  props: ComponentProps<typeof Modal.DialogDescription>,
) {
  return use(PageContext) ? (
    <p {...props} className="text-sm leading-relaxed text-muted-foreground" />
  ) : (
    <Modal.DialogDescription {...props} />
  );
}
export function DialogFooter(props: ComponentProps<typeof Modal.DialogFooter>) {
  return use(PageContext) ? (
    <div
      {...props}
      className="flex flex-wrap justify-end gap-3 border-t pt-5"
    />
  ) : (
    <Modal.DialogFooter {...props} />
  );
}
