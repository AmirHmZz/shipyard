import { lazy, Suspense } from "react";

import { ErrorState, Loading } from "@/components/Shared";
import { loadComposeEditor } from "@/lib/feature-loaders";

import type { Source } from "../generics";

const Editor = lazy(loadComposeEditor);

export type SourceEditorProps = {
  pending: boolean;
  error: unknown;
  draft: Source | null;
  disabled: boolean;
  onChange: (yaml: string) => void;
};

export function SourceEditor({
  pending,
  error,
  draft,
  disabled,
  onChange,
}: SourceEditorProps) {
  if (pending) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!draft) return null;
  return (
    <Suspense fallback={<Loading />}>
      <Editor value={draft.yaml} disabled={disabled} onChange={onChange} />
    </Suspense>
  );
}
