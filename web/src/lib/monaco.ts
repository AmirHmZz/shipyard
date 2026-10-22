import type { JSONSchema } from "monaco-yaml";

import { loader } from "@monaco-editor/react";
import "monaco-editor/esm/vs/editor/editor.all.js";
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { configureMonacoYaml } from "monaco-yaml";

import composeSchema from "./schemas/compose-spec.json";

// All language services run in bundled same-origin workers, including schemas.
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "yaml")
      return new Worker(new URL("./workers/yaml.ts", import.meta.url), {
        type: "module",
      });
    return new Worker(new URL("./workers/editor.ts", import.meta.url), {
      type: "module",
    });
  },
};
loader.config({ monaco });

const yaml = configureMonacoYaml(monaco, {
  enableSchemaRequest: false,
  completion: true,
  hover: true,
  validate: true,
  format: { enable: true, printWidth: 100, proseWrap: "preserve" },
  schemas: [
    {
      uri: "https://raw.githubusercontent.com/compose-spec/compose-spec/914ec15d1fa498969c0df5c1d672306db3256089/schema/compose-spec.json",
      fileMatch: ["**/compose.yaml"],
      schema: composeSchema as unknown as JSONSchema,
    },
  ],
});
if (import.meta.hot) import.meta.hot.dispose(() => yaml.dispose());

for (const dark of [false, true]) {
  monaco.editor.defineTheme(dark ? "shipyard-dark" : "shipyard-light", {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "", foreground: dark ? "DCE5D9" : "25372A" },
      { token: "tag", foreground: dark ? "94BAD3" : "28618A" },
      { token: "string", foreground: dark ? "BAD39E" : "486E32" },
      { token: "number", foreground: dark ? "DFB586" : "945B22" },
      { token: "keyword", foreground: dark ? "C9B0E5" : "79549A" },
      {
        token: "comment",
        foreground: dark ? "81907D" : "71816B",
        fontStyle: "italic",
      },
    ],
    colors: {
      "editor.background": dark ? "#111813" : "#FAFCF9",
      "editor.foreground": dark ? "#DCE5D9" : "#25372A",
      "editorGutter.background": dark ? "#111813" : "#FAFCF9",
      "editorLineNumber.foreground": dark ? "#667663" : "#9AA793",
      "editorLineNumber.activeForeground": dark ? "#C6D9B8" : "#38694A",
      "editor.lineHighlightBackground": dark ? "#1B271E" : "#EDF3E9",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": dark ? "#354A38" : "#D9E7D0",
      "editor.inactiveSelectionBackground": dark ? "#29362B" : "#E6EDDF",
      "editorCursor.foreground": dark ? "#A8C98F" : "#38694A",
      "editorIndentGuide.background1": dark ? "#28352A" : "#E1E7DB",
      "editorIndentGuide.activeBackground1": dark ? "#53684B" : "#A6BA98",
      "editorWidget.background": dark ? "#1C271E" : "#FFFFFF",
      "editorWidget.border": dark ? "#364335" : "#DBE1D7",
      "editorSuggestWidget.background": dark ? "#1C271E" : "#FFFFFF",
      "editorSuggestWidget.border": dark ? "#364335" : "#DBE1D7",
      "editorSuggestWidget.selectedBackground": dark ? "#2A382A" : "#E8EFE5",
      "editorHoverWidget.background": dark ? "#1C271E" : "#FFFFFF",
      "editorHoverWidget.border": dark ? "#364335" : "#DBE1D7",
      "scrollbarSlider.background": dark ? "#41544270" : "#B1BCB070",
      "scrollbarSlider.hoverBackground": dark ? "#6C8768A0" : "#7B907CA0",
      "scrollbarSlider.activeBackground": dark ? "#6C8768" : "#7B907C",
      focusBorder: "#00000000",
    },
  });
}
