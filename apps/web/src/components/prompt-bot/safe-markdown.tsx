import ReactMarkdown, { type Components } from "react-markdown";

/**
 * Links leave in a new tab without handing over the page (unsaved edits stay); images are not
 * rendered, so AI-written Markdown never loads remote content. react-markdown renders no raw HTML.
 */
const SAFE: Components = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `node` is react-markdown's AST node, not a DOM prop.
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  img: () => null,
};

/** Markdown from the AI, rendered safely. `components` adds to (never replaces) the link and image rules. */
export function SafeMarkdown({ children, className, components }: { children: string; className?: string; components?: Components }) {
  return (
    <div className={className}>
      <ReactMarkdown components={{ ...components, ...SAFE }}>{children}</ReactMarkdown>
    </div>
  );
}
