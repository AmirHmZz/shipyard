import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

export type InputGroupProps = ComponentProps<"div">;
export function InputGroup({ className, ...props }: InputGroupProps) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[aria-invalid=true]]:border-destructive dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
export type InputGroupInputProps = ComponentProps<typeof Input>;
export function InputGroupInput({ className, ...props }: InputGroupInputProps) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        "h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}
export type InputGroupAddonProps = ComponentProps<"div"> & {
  align?: "inline-start" | "inline-end";
};
export function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: InputGroupAddonProps) {
  return (
    <div
      data-slot="input-group-addon"
      className={cn(
        "flex shrink-0 items-center text-sm text-muted-foreground",
        align === "inline-start" ? "order-first pl-3" : "order-last pr-3",
        className,
      )}
      {...props}
    />
  );
}
export type InputGroupTextProps = ComponentProps<"span">;
export function InputGroupText({ className, ...props }: InputGroupTextProps) {
  return <span className={cn("whitespace-nowrap", className)} {...props} />;
}
