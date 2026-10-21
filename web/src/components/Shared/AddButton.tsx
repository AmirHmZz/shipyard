import type { ReactNode } from "react";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export type AddButtonProps = {
  children: ReactNode;
  onClick: () => void;
};

export function AddButton({ children, onClick }: AddButtonProps) {
  return (
    <Button onClick={onClick}>
      <Plus />
      {children}
    </Button>
  );
}
