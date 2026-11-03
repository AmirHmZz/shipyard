import type { ChangeEvent, MouseEvent } from "react";

import { Plus, Trash2 } from "lucide-react";
import * as z from "zod/mini";

import { FormField } from "@/components/FormField";
import { InputField } from "@/components/InputField";
import { useResourceForm } from "@/components/resource-forms/controller";
import { Button } from "@/components/ui/button";
import {
  maxRateLimitPathLength,
  maxRateLimitRequests,
  maxRateLimitWindow,
  maxRateLimits,
  rateLimitDraftsSchema,
  rateLimitMatchSchema,
} from "@/lib/schemas/rate-limits";

const rowIdSchema = z.coerce.number().check(z.int(), z.gte(0));
const fieldSchema = z.enum(["path", "requests", "windowSeconds", "match"]);

export function RouteRateLimits() {
  const {
    state: { data, busy },
    handlers: { update, change },
    derived: { formId },
  } = useResourceForm();
  const rows = rateLimitDraftsSchema.safeParse(data.rateLimits).data ?? [];

  function addRule() {
    if (rows.length >= maxRateLimits) return;
    const id = Math.max(-1, ...rows.map((row) => row.id)) + 1;
    update("rateLimits", [
      ...rows,
      { id, path: "", match: "exact", requests: 60, windowSeconds: 60 },
    ]);
    change();
  }

  function removeRule(event: MouseEvent<HTMLButtonElement>) {
    const id = rowIdSchema.safeParse(event.currentTarget.dataset.ruleId);
    if (!id.success) return;
    update(
      "rateLimits",
      rows.filter((row) => row.id !== id.data),
    );
    change();
  }

  function editRule(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { value, dataset } = event.currentTarget;
    const id = rowIdSchema.safeParse(dataset.ruleId);
    const field = fieldSchema.safeParse(dataset.ruleField);
    if (!id.success || !field.success) return;
    if (
      field.data === "match" &&
      !rateLimitMatchSchema.safeParse(value).success
    )
      return;
    update(
      "rateLimits",
      rows.map((row) =>
        row.id === id.data ? { ...row, [field.data]: value } : row,
      ),
    );
    change();
  }

  if (data.protocol !== "https") {
    return rows.length > 0 ? (
      <p className="text-sm text-muted-foreground">
        Saving with this protocol removes the HTTPS rate limits.
      </p>
    ) : null;
  }

  return (
    <fieldset
      disabled={busy}
      className="flex min-w-0 flex-col gap-3 border-t pt-4"
    >
      <legend className="text-sm font-medium">Rate limits</legend>
      <p className="text-xs text-muted-foreground">
        Limits apply per source IP. A subtree includes the path and its
        descendants. Exact paths and more specific subtrees take precedence.
      </p>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-2 gap-3 rounded-lg border p-3"
        >
          <InputField
            label="Path"
            labelProps={{ htmlFor: `${formId}-rate-${row.id}-path` }}
            inputProps={{
              id: `${formId}-rate-${row.id}-path`,
              value: row.path,
              placeholder: "/api",
              required: true,
              maxLength: maxRateLimitPathLength,
              "data-rule-id": row.id,
              "data-rule-field": "path",
              onChange: editRule,
            }}
          />
          <FormField
            label="Match"
            labelProps={{ htmlFor: `${formId}-rate-${row.id}-match` }}
          >
            <select
              id={`${formId}-rate-${row.id}-match`}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={row.match}
              data-rule-id={row.id}
              data-rule-field="match"
              onChange={editRule}
            >
              <option value="exact">Exact path</option>
              <option value="subtree">Subtree</option>
            </select>
          </FormField>
          <InputField
            label="Requests"
            labelProps={{ htmlFor: `${formId}-rate-${row.id}-requests` }}
            inputProps={{
              id: `${formId}-rate-${row.id}-requests`,
              type: "number",
              value: row.requests,
              required: true,
              min: 1,
              max: maxRateLimitRequests,
              "data-rule-id": row.id,
              "data-rule-field": "requests",
              onChange: editRule,
            }}
          />
          <InputField
            label="Window (seconds)"
            labelProps={{ htmlFor: `${formId}-rate-${row.id}-window` }}
            inputProps={{
              id: `${formId}-rate-${row.id}-window`,
              type: "number",
              value: row.windowSeconds,
              required: true,
              min: 1,
              max: maxRateLimitWindow,
              "data-rule-id": row.id,
              "data-rule-field": "windowSeconds",
              onChange: editRule,
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className="col-span-2 justify-self-end"
            data-rule-id={row.id}
            onClick={removeRule}
          >
            <Trash2 />
            Remove rule
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={rows.length >= maxRateLimits}
        onClick={addRule}
      >
        <Plus />
        Add rate limit
      </Button>
    </fieldset>
  );
}
