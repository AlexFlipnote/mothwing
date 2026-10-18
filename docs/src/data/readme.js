/*
  The README's introduction, from its first paragraph to "## Built with mothwing", as HTML for the front page.
  Only the Markdown that part uses is understood: paragraphs, ## headings, **bold**, `code` and [links](url).
*/
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { escapeHtml } from "mothwing/html"

const README = path.resolve(fileURLToPath(import.meta.url), "../../../../README.md")

export const sources = ["../../README.md"]

/**
 * @param {string} text A line of Markdown
 * @returns {string} As HTML
 */
const inline = (text) => escapeHtml(text)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "<a href=\"$2\">$1</a>")

export default () => {
  const readme = fs.readFileSync(README, "utf8").replaceAll("\r\n", "\n")
  const start = readme.indexOf("**Write HTML")
  const end = readme.indexOf("\n## Built with mothwing")
  if (start < 0 || end < start) throw new Error("readme: can't find the introduction, from **Write HTML to ## Built with mothwing")

  const intro = readme.slice(start, end).trim()
    .split(/\n+/)
    .map(line => line.startsWith("## ") ? `<h2>${inline(line.slice(3))}</h2>` : `<p>${inline(line)}</p>`)
    .join("\n")
  return { intro }
}
