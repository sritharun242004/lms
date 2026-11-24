/** Same pattern as Anthropic's quick_validate.py: `^---\n(.*?)\n---` with DOTALL. No YAML parsing here (client-safe). */
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;

export function splitFrontmatter(content: string): { frontmatter: string; body: string; rest: string } | null {
  if (!content.startsWith("---")) return null;
  const match = FRONTMATTER.exec(content);
  if (!match) return null;
  const rest = content.slice(match[0].length);
  return { frontmatter: match[1], body: rest.replace(/^\n+/, ""), rest };
}
