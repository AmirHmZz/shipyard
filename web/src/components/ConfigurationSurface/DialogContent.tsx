import type { ComponentProps } from "react";

import { use } from "react";

import * as Modal from "@/components/ui/dialog";
import { ConfigurationPageContext } from "@/lib/configuration-page-context";

export type DialogContentProps = ComponentProps<typeof Modal.DialogContent>;

export function DialogContent({
  children,
  className,
  ...props
}: DialogContentProps) {
  return use(ConfigurationPageContext) ? (
    <div className="space-y-6">{children}</div>
  ) : (
    <Modal.DialogContent className={className} {...props}>
      {children}
    </Modal.DialogContent>
  );
}
