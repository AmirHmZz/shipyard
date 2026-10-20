export function loadComposeEditor() {
  return import("@/components/compose-code-editor").then((module) => ({
    default: module.ComposeCodeEditor,
  }));
}
