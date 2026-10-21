import type { ComponentProps } from "react";

import { use } from "react";

import * as Modal from "@/components/ui/dialog";
import { ConfigurationPageContext } from "@/lib/configuration-page-context";

export type DialogHeaderProps = ComponentProps<typeof Modal.DialogHeader>;

export function DialogHeader(props: DialogHeaderProps) {
  return use(ConfigurationPageContext) ? (
    <header {...props} className="flex flex-col gap-3" />
  ) : (
    <Modal.DialogHeader {...props} />
  );
}
