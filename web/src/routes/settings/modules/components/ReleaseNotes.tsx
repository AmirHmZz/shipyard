import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const plugins = [remarkGfm];

export type ReleaseNotesProps = { children: string };
export function ReleaseNotes({ children }: ReleaseNotesProps) {
  return (
    <div className="release-notes min-w-0 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
      <Markdown remarkPlugins={plugins} skipHtml>
        {children}
      </Markdown>
    </div>
  );
}
