import { Link } from "react-router";

import type { Resource } from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { text } from "@/lib/resource-fields";
export type PreviewCardProps = {
  preview: Resource;
  canWrite: boolean;
  approving: boolean;
};
export function PreviewCard({
  preview,
  canWrite,
  approving,
}: PreviewCardProps) {
  let approvalLabel = "Awaiting exact-commit approval";
  if (preview.data.approvedSha === preview.data.previewSha)
    approvalLabel = "Commit approved";
  if (preview.data.previewClosed) approvalLabel = "Closed";
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <Link
            className="font-medium hover:underline"
            to={`/applications/${preview.id}`}
          >
            {preview.name}
          </Link>
          <p className="text-xs text-muted-foreground">{approvalLabel}</p>
          <code className="text-xs">
            {text(preview.data, "previewSha").slice(0, 12)}
          </code>
        </div>
        {canWrite &&
          !preview.data.previewClosed &&
          preview.data.approvedSha !== preview.data.previewSha && (
            <Button disabled={approving} data-preview-id={preview.id}>
              Approve this commit
            </Button>
          )}
      </CardContent>
    </Card>
  );
}
