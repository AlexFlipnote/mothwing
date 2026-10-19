/*
  The examples, examples/*.md in the order they're read in. Each is an item of {{ examples }}, a page of
  pages/examples/[examples.slug].html, with the ones before and after it to go on to.
*/
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { markdown, plain } from "../lib/markdown.js"

const EXAMPLES = path.resolve(fileURLToPath(import.meta.url), "../../../../examples")

/** By their file name, a new one has to be put in here too */
const ORDER = ["data", "loops", "pages", "tags", "making-it-yours"]

export default () => {
  const files = fs.readdirSync(EXAMPLES).filter(file => file.endsWith(".md")).map(file => file.slice(0, -3))
  const missing = files.filter(name => !ORDER.includes(name))
  if (missing.length) throw new Error(`examples: ${missing.join(", ")} isn't in ORDER`)

  const examples = ORDER.map(name => {
    const text = fs.readFileSync(path.join(EXAMPLES, `${name}.md`), "utf8").replaceAll("\r\n", "\n")
    const title = text.match(/^# (.+)$/m)?.[1]
    if (!title) throw new Error(`examples: ${name}.md has no # title`)
    // The first paragraph, past the title and any code, for the description and the list
    const first = text.replace(/^```[\s\S]*?^```$/gm, "").split("\n").find(line => line.trim() && !/^[#|]/.test(line)) ?? title
    return {
      slug: name,
      title,
      summary: plain(first),
      // The title is the page's own <h1>
      html: markdown(text.replace(/^# .+\n/, "")),
      // Relative to docs/src, so each page is dated by its own file
      sources: [`../../examples/${name}.md`]
    }
  })
  return examples.map((example, i) => ({ ...example, previous: examples[i - 1] ?? null, next: examples[i + 1] ?? null }))
}
