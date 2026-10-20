import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";

import "@/lib/monaco";

import Editor from "@monaco-editor/react";
import { FileCode2, WandSparkles, WrapText } from "lucide-react";
import { useEffect, useId, useReducer } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  initialComposeEditorState,
  composeEditorReducer,
} from "@/lib/compose-editor-state";

let tabNavigationInitialized = false;

export type ComposeCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};
export function ComposeCodeEditor({
  value,
  onChange,
  disabled = false,
}: ComposeCodeEditorProps) {
  function handleButtonClick() {
    return void format();
  }
  function handleButtonClick2() {
    return dispatch({ type: "wrap_toggled" });
  }
  function handleEditorChange(value: string | undefined) {
    return onChange(value ?? "");
  }

  const id = useId();
  const [{ instance, wrap, dark }, dispatch] = useReducer(
    composeEditorReducer,
    document.documentElement.classList.contains("dark"),
    initialComposeEditorState,
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      dispatch({
        type: "theme_changed",
        value: document.documentElement.classList.contains("dark"),
      }),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  function mounted(editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) {
    editor.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF);
    // Enable the global default once. Remounts after saving must preserve it,
    // including any later preference change made by the user with Ctrl+M.
    if (!tabNavigationInitialized) {
      editor.trigger("shipyard", "editor.action.toggleTabFocusMode", null);
      tabNavigationInitialized = true;
    }
    editor.getDomNode()?.setAttribute("data-private", "true");
    dispatch({ type: "mounted", instance: editor });
  }
  async function format() {
    try {
      await instance?.getAction("editor.action.formatDocument")?.run();
    } catch {
      toast.error("Unable to format YAML. Check its syntax and try again.");
    }
  }
  return (
    <div
      data-testid="compose-code-editor"
      data-private
      className="min-w-0 overflow-hidden rounded-xl border bg-background focus-within:border-ring/60"
    >
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <FileCode2 className="size-4 shrink-0 text-primary" />
          <span className="font-mono">compose.yaml</span>
          <span className="hidden text-[10px] text-muted-foreground sm:inline">
            YAML
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled || !instance}
            onClick={handleButtonClick}
          >
            <WandSparkles />
            Format
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Toggle word wrap"
            aria-pressed={wrap}
            title="Word wrap"
            disabled={!instance}
            onClick={handleButtonClick2}
          >
            <WrapText />
          </Button>
        </div>
      </div>
      <Editor
        height="clamp(280px, 52vh, 460px)"
        language="yaml"
        path={`file:///shipyard/${encodeURIComponent(id)}/compose.yaml`}
        value={value}
        onChange={handleEditorChange}
        onMount={mounted}
        theme={dark ? "shipyard-dark" : "shipyard-light"}
        saveViewState={false}
        keepCurrentModel={false}
        loading={
          <p role="status" className="p-4 text-sm text-muted-foreground">
            Loading editor…
          </p>
        }
        options={{
          ariaLabel: "Compose YAML",
          readOnly: disabled,
          automaticLayout: true,
          accessibilitySupport: "on",
          minimap: { enabled: false },
          fontFamily:
            '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
          fontSize: 13,
          lineHeight: 22,
          padding: { top: 16, bottom: 16 },
          lineNumbersMinChars: 3,
          lineDecorationsWidth: 12,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          wordWrap: wrap ? "on" : "off",
          wrappingIndent: "indent",
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: false,
          autoIndent: "advanced",
          formatOnPaste: false,
          renderLineHighlight: "line",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          glyphMargin: false,
          folding: true,
          fixedOverflowWidgets: true,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            useShadows: false,
            alwaysConsumeMouseWheel: false,
          },
        }}
      />
    </div>
  );
}
