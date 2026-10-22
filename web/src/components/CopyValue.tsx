import { CopyButton } from "@/components/Shared/CopyButton";

export type CopyValueProps = {
  value: string;
  label: string;
  placeholder?: string;
};
export function CopyValue({ value, label, placeholder }: CopyValueProps) {
  const canCopy = placeholder === undefined || !!value;
  return (
    <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
      <code className="w-full min-w-0 break-all text-xs sm:w-auto sm:flex-1">
        {value || placeholder}
      </code>
      {canCopy && <CopyButton label={label} value={value} />}
    </div>
  );
}
