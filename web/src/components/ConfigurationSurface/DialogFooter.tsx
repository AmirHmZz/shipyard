import type { ComponentProps } from "react";

import { use } from "react";

import * as Modal from "@/components/ui/dialog";
import { ConfigurationPageContext } from "@/lib/configuration-page-context";

export type DialogFooterProps = ComponentProps<typeof Modal.DialogFooter>;

export function DialogFooter(props: DialogFooterProps) {
  return use(ConfigurationPageContext) ? (
    <div
      {...props}
      className="flex flex-wrap justify-end gap-3 border-t pt-5"
    />
  ) : (
    <Modal.DialogFooter {...props} />
  );
}
