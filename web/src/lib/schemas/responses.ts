import * as z from "zod/mini";
// A 204 has no value; existing JSON acknowledgements use an empty object.
export const emptyResponseSchema = z.optional(z.object({}));
export const blobResponseSchema = z.custom<Blob>(
  (value): value is Blob =>
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function" &&
    "slice" in value &&
    typeof value.slice === "function" &&
    "text" in value &&
    typeof value.text === "function" &&
    "type" in value &&
    typeof value.type === "string" &&
    "size" in value &&
    typeof value.size === "number",
);
