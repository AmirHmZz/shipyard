import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { describeError } from "@/lib/api/translate-error";

export type ErrorStateProps = { error: unknown };

export function ErrorState({ error }: ErrorStateProps) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertDescription>{describeError(error)}</AlertDescription>
    </Alert>
  );
}
