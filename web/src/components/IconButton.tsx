import type { ButtonProps } from "@/components/ui/button";

import { Button } from "@/components/ui/button";

export type IconButtonProps = Omit<ButtonProps, "asChild"> & { label: string };

export function IconButton({ label, ...props }: IconButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      {...props}
    />
  );
}
