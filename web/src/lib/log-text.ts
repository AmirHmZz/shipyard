const ESCAPE = String.fromCharCode(27);
const BELL = String.fromCharCode(7);
const STRING_TERMINATOR = String.fromCharCode(156);
const OPERATING_SYSTEM_COMMAND = String.fromCharCode(157);
const CONTROL_SEQUENCE_INTRODUCER = String.fromCharCode(155);
const COMMAND_CONTENT = "[^" + BELL + ESCAPE + STRING_TERMINATOR + "]*";
const COMMAND_END =
  "(?:" + BELL + "|" + ESCAPE + "\\\\" + "|" + STRING_TERMINATOR + ")";
const CONTROL_SEQUENCE_1 = new RegExp(
  ESCAPE + "]" + COMMAND_CONTENT + COMMAND_END,
  "g",
);
const CONTROL_SEQUENCE_2 = new RegExp(
  OPERATING_SYSTEM_COMMAND + COMMAND_CONTENT + COMMAND_END,
  "g",
);
const CONTROL_SEQUENCE_3 = new RegExp(
  "(?:" + ESCAPE + "\\[|" + CONTROL_SEQUENCE_INTRODUCER + ")[0-?]*[ -/]*[@-~]",
  "g",
);
const CONTROL_SEQUENCE_4 = new RegExp(ESCAPE + "[ -/]*[@-Z\\\\-_]", "g");
function controlRange(start: number, end: number) {
  return String.fromCharCode(start) + "-" + String.fromCharCode(end);
}
const CONTROL_SEQUENCE_5 = new RegExp(
  "[" +
    controlRange(0, 8) +
    controlRange(11, 31) +
    controlRange(127, 159) +
    "]",
  "g",
);
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
