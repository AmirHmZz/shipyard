import type { ComponentProps } from "react";

import { use } from "react";

import * as Modal from "@/components/ui/dialog";
import { ConfigurationPageContext } from "@/lib/configuration-page-context";

export type DialogTitleProps = ComponentProps<typeof Modal.DialogTitle>;

export function DialogTitle(props: DialogTitleProps) {
  return use(ConfigurationPageContext) ? (
    <h1 {...props} className="text-3xl font-semibold tracking-tight" />
  ) : (
    <Modal.DialogTitle {...props} />
  );
}
