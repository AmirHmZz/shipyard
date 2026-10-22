import { describe, expect, it } from "vitest";

import { logText } from "./log-text";
describe("plain log text", () => {
  it("removes Rust tracing formatting", () => {
    expect(
      logText(
        "\x1b[2m2026-10-17T19:33:10Z\x1b[0m \x1b[32m INFO\x1b[0m \x1b[2mspeculum\x1b[0m: listening \x1b[3maddress\x1b[0m=0.0.0.0:8080",
      ),
    ).toBe(
      "2026-10-17T19:33:10Z  INFO speculum: listening address=0.0.0.0:8080",
    );
  });
  it("preserves Unicode, tabs and newlines while removing hyperlink metadata", () => {
    expect(
      logText(
        "سلام\t\x1b]8;;https://example.com\x1b\\example\x1b]8;;\x1b\\\n✓ ready",
      ),
    ).toBe("سلام\texample\n✓ ready");
  });
  it("supports C1 controls and leaves ordinary brackets alone", () => {
    expect(logText("\x9b31merror\x9b0m [failed]")).toBe("error [failed]");
  });
  it("strips C0 and C1 control bytes while preserving tab and line feed", () => {
    for (const code of [
      ...Array.from({ length: 32 }, (_, index) => index),
      ...Array.from({ length: 33 }, (_, index) => 127 + index),
    ]) {
      const character = String.fromCharCode(code);
      expect(logText(character + "✓")).toBe(
        code === 9 || code === 10 ? character + "✓" : "✓",
      );
    }
    expect(logText("\x1b]title\x07visible\x9dtitle\x9c\x1bM")).toBe("visible");
  });
});
