import { useConfigurationChanges } from "@/lib/configuration-state";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";
import * as React from "react";
import { Button } from "./button";

function Input({
  className,
  type,
  ref,
  ...props
}: React.ComponentProps<"input">) {
  const changes = useConfigurationChanges();
  const local = React.useRef<HTMLInputElement | null>(null);
  const numeric = type === "number";
  function step(direction: number) {
    const input = local.current;
    if (!input || input.disabled || input.readOnly) return;
    if (props.step === "any") {
      const next = Math.min(
        Number(props.max ?? Infinity),
        Math.max(
          Number(props.min ?? -Infinity),
          (input.valueAsNumber || 0) + direction,
        ),
      );
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, String(next));
    } else if (direction > 0) input.stepUp();
    else input.stepDown();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus({ preventScroll: true });
  }
  const input = (
    <input
      ref={(node) => {
        local.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        numeric && "pr-18",
        className,
      )}
      {...props}
      onChange={(event) => {
        changes.change();
        props.onChange?.(event);
      }}
    />
  );
  if (!numeric) return input;
  const value =
    props.value === "" || props.value == null ? NaN : Number(props.value);
  return (
    <div className="relative min-w-0 w-full" data-slot="number-input">
      {input}
      <div className="absolute inset-y-1 right-1 flex items-center gap-0.5 border-l pl-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Decrease value"
          disabled={
            props.disabled ||
            props.readOnly ||
            (Number.isFinite(value) &&
              props.min != null &&
              value <= Number(props.min))
          }
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => step(-1)}
        >
          <Minus className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Increase value"
          disabled={
            props.disabled ||
            props.readOnly ||
            (Number.isFinite(value) &&
              props.max != null &&
              value >= Number(props.max))
          }
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => step(1)}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}

export { Input };
