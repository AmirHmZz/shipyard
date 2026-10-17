import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useLocation, useBlocker, useBeforeUnload } from "react-router-dom";
import { flushSync } from "react-dom";
import * as Modal from "@/components/ui/dialog";
import { Confirm } from "@/components/shared";
import { cn } from "@/lib/utils";
const PageContext = createContext(false);
export function Dialog({
  children,
  ...props
}: ComponentProps<typeof Modal.Dialog>) {
  const path = useLocation().pathname;
  const page = path.startsWith("/configure/") || /\/records\//.test(path);
  return (
    <PageContext value={page}>
      {page ? (
        props.open === false ? null : (
          <section>{children}</section>
        )
      ) : (
        <Modal.Dialog {...props}>{children}</Modal.Dialog>
      )}
    </PageContext>
  );
}
export function DialogContent({
  children,
  className,
  ...props
}: ComponentProps<typeof Modal.DialogContent>) {
  const page = useContext(PageContext);
  const location = useLocation();
  return page ? (
    location.pathname.startsWith("/configure/") ? (
      <div className="space-y-6">{children}</div>
    ) : (
      <ConfigurationGuard>{children}</ConfigurationGuard>
    )
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
  const [dirty, setDirty] = useState(false);
  const blocker = useBlocker(dirty);
  useBeforeUnload((event) => {
    if (dirty) event.preventDefault();
  });
  useEffect(() => {
    const reset = () => flushSync(() => setDirty(false));
    const changed = () => setDirty(true);
    window.addEventListener("configuration-saved", reset);
    window.addEventListener("configuration-dirty", changed);
    return () => {
      window.removeEventListener("configuration-saved", reset);
      window.removeEventListener("configuration-dirty", changed);
    };
  }, []);
  return (
    <div
      className={cn("mx-auto w-full max-w-4xl space-y-7 pb-10", className)}
      onChangeCapture={() => setDirty(true)}
      onInputCapture={() => setDirty(true)}
      onClickCapture={(event) => {
        if (
          (event.target as HTMLElement).closest(
            '[role="combobox"],[role="switch"]',
          )
        )
          setDirty(true);
      }}
    >
      {children}
      <Confirm
        open={blocker.state === "blocked"}
        onOpenChange={(open) =>
          !open && blocker.state === "blocked" && blocker.reset()
        }
        title="Discard unsaved changes?"
        description="Your unsaved configuration will be lost."
        onConfirm={async () => {
          setDirty(false);
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />
    </div>
  );
}
export function DialogHeader(props: ComponentProps<typeof Modal.DialogHeader>) {
  return useContext(PageContext) ? (
    <header {...props} className="space-y-3" />
  ) : (
    <Modal.DialogHeader {...props} />
  );
}
export function DialogTitle(props: ComponentProps<typeof Modal.DialogTitle>) {
  return useContext(PageContext) ? (
    <h1 {...props} className="text-3xl font-semibold tracking-tight" />
  ) : (
    <Modal.DialogTitle {...props} />
  );
}
export function DialogDescription(
  props: ComponentProps<typeof Modal.DialogDescription>,
) {
  return useContext(PageContext) ? (
    <p {...props} className="text-sm leading-relaxed text-muted-foreground" />
  ) : (
    <Modal.DialogDescription {...props} />
  );
}
export function DialogFooter(props: ComponentProps<typeof Modal.DialogFooter>) {
  return useContext(PageContext) ? (
    <div
      {...props}
      className="flex flex-wrap justify-end gap-3 border-t pt-5"
    />
  ) : (
    <Modal.DialogFooter {...props} />
  );
}
