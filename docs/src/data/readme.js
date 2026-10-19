/*
  Parts of the README as HTML for the front page: its introduction, from its first paragraph to "## Built with mothwing",
  and "## Getting started" up to the next heading.
*/
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { markdown } from "../lib/markdown.js"

const README = path.resolve(fileURLToPath(import.meta.url), "../../../../README.md")

export const sources = ["../../README.md"]

/**
 * @param {string} readme
 * @param {string} from Where the part starts, kept
 * @param {string} [to] Where it ends, left out. The next ## heading
 * @returns {string} The part as HTML
 */
const part = (readme, from, to) => {
  const start = readme.indexOf(from)
  const end = to ? readme.indexOf(to, start) : readme.indexOf("\n## ", start + from.length)
  if (start < 0 || end < start) throw new Error(`readme: can't find the part from ${from} to ${to ?? "the next heading"}`)
  return markdown(readme.slice(start, end).trim())
}

export default () => {
  const readme = fs.readFileSync(README, "utf8").replaceAll("\r\n", "\n")
  return {
    intro: part(readme, "**Write HTML", "\n## Built with mothwing"),
    start: part(readme, "## Getting started")
  }
}
