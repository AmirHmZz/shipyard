const CONTROL_SEQUENCE_1 =
  /\u001b\][^\u0007\u001b\u009c]*(?:\u0007|\u001b\\|\u009c)/g;
const CONTROL_SEQUENCE_2 =
  /\u009d[^\u0007\u001b\u009c]*(?:\u0007|\u001b\\|\u009c)/g;
const CONTROL_SEQUENCE_3 = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g;
const CONTROL_SEQUENCE_4 = /\u001b[ -/]*[@-Z\\-_]/g;
const CONTROL_SEQUENCE_5 = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
// Logs are plain text: terminal formatting and hyperlink metadata must not appear
// in the viewer or the clipboard. Keep visible Unicode and line breaks intact.
export function logText(value: string): string {
  return value
    .replace(CONTROL_SEQUENCE_1, "")
    .replace(CONTROL_SEQUENCE_2, "")
    .replace(CONTROL_SEQUENCE_3, "")
    .replace(CONTROL_SEQUENCE_4, "")
    .replace(CONTROL_SEQUENCE_5, "");
}
