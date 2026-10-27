/*
  The examples, each a site in examples/ whose README.md explains it, in the order they're read in. Each is an item of
  {{ examples }}, a page of pages/examples/[examples.slug].html, with the ones before and after it to go on to.
*/
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { markdown, plain } from "../lib/markdown.js"

const EXAMPLES = path.resolve(fileURLToPath(import.meta.url), "../../../../examples")

/** By their folder's name, a new one has to be put in here too */
const ORDER = ["data", "loops", "pages", "tags", "making-it-yours", "going-live"]

export default () => {
  const folders = fs.readdirSync(EXAMPLES, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  const missing = folders.filter(name => !ORDER.includes(name))
  if (missing.length) throw new Error(`examples: ${missing.join(", ")} isn't in ORDER`)

  const examples = ORDER.map(name => {
    const text = fs.readFileSync(path.join(EXAMPLES, name, "README.md"), "utf8").replaceAll("\r\n", "\n")
    const title = text.match(/^# (.+)$/m)?.[1]
    if (!title) throw new Error(`examples: ${name}/README.md has no # title`)
    // The first paragraph, past the title and any code, for the description and the list
    const first = text.replace(/^```[\s\S]*?^```$/gm, "").split("\n").find(line => line.trim() && !/^[#|]/.test(line)) ?? title
    return {
      slug: name,
      title,
      summary: plain(first),
      // The title is the page's own <h1>
      html: markdown(text.replace(/^# .+\n/, "")),
      sources: fs.readdirSync(path.join(EXAMPLES, name), { recursive: true, encoding: "utf8" })
        .map(file => file.replaceAll("\\", "/"))
        .filter(file => !file.startsWith("dist/") && fs.statSync(path.join(EXAMPLES, name, file)).isFile())
        .map(file => `../../examples/${name}/${file}`)
    }
  })
  return examples.map((example, i) => ({ ...example, previous: examples[i - 1] ?? null, next: examples[i + 1] ?? null }))
}
