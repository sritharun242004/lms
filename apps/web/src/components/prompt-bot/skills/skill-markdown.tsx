import ReactMarkdown, { type Components } from "react-markdown";
import { splitFrontmatter } from "@/lib/skills/frontmatter";

const BODY =
  "text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs dark:[&_code]:bg-white/10 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_pre]:mt-3 [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-3 dark:[&_pre]:bg-white/5 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5";

/** Links leave in a new tab (unsaved edits stay); images are not rendered, so a skill never loads remote content. */
const COMPONENTS: Components = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `node` is react-markdown's AST node, not a DOM prop.
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  img: () => null,
};

/** SKILL.md as the reader sees it: the frontmatter as-is, the body as Markdown (react-markdown renders no raw HTML). */
export function SkillMarkdown({ content }: { content: string }) {
  const parts = splitFrontmatter(content);
  return (
    <div className="mt-3 rounded-2xl bg-white/60 p-4 dark:bg-white/5">
      {parts && (
        <pre aria-label="Frontmatter" className="overflow-auto whitespace-pre-wrap rounded-xl bg-muted px-3 py-2 font-mono text-xs dark:bg-white/10">
          {parts.frontmatter}
        </pre>
      )}
      <div className={BODY}>
        <ReactMarkdown components={COMPONENTS}>{parts ? parts.body : content}</ReactMarkdown>
      </div>
    </div>
  );
}
