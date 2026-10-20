import * as z from "zod/mini";
// A 204 has no value; existing JSON acknowledgements use an empty object.
export const emptyResponseSchema = z.optional(z.object({}));
export const blobResponseSchema = z.instanceof(Blob);
