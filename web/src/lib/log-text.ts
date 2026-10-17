// Logs are plain text: terminal formatting and hyperlink metadata must not appear
// in the viewer or the clipboard. Keep visible Unicode and line breaks intact.
export function logText(value: string): string {
  return value
    .replace(/\u001b\][^\u0007\u001b\u009c]*(?:\u0007|\u001b\\|\u009c)/g, "")
    .replace(/\u009d[^\u0007\u001b\u009c]*(?:\u0007|\u001b\\|\u009c)/g, "")
    .replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[ -/]*[@-Z\\-_]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
}
