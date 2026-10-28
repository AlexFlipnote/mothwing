import fs from "fs"
import path from "path"
import { log, plural, posix } from "./log.js"

/** Shown in full, the rest only counted */
const SHOWN = 10

// Regexes rather than minify's tokenizer, which takes over ten times as long on a big site
/** Comments, and the content of elements that's text, keeping their opening tag for a <script src> */
const SKIP = /<!--[\s\S]*?-->|(<(script|style|textarea|title)\b[^>]*>)[\s\S]*?<\/\2[ \t\n\r\f]*>/gi
const LINK = /[ \t\n\r\f](?:href|src)[ \t\n\r\f]*=[ \t\n\r\f]*(?:"([^"]*)"|'([^']*)'|([^ \t\n\r\f>]+))/gi

/**
 * @param {string} html
 * @returns {Generator<string>} Each href and src that's a path, not a full URL, which can be served by anything, even
 *   on the site's own domain
 */
function* pathLinks(html) {
  const tags = html.replace(SKIP, "$1")
  for (const match of tags.matchAll(LINK)) {
    // In a tag, not text that reads like one, as in <code>&lt;a href="/x"&gt;</code>
    if (tags.lastIndexOf("<", match.index) < tags.lastIndexOf(">", match.index)) continue
    const value = (match[1] ?? match[2] ?? match[3]).trim()
    if (value && !/^([a-z][a-z\d+.-]*:|\/\/)/i.test(value)) yield value
  }
}

/**
 * Fails the build on a link to a page or file the build doesn't have. Run after the hooks, as they can write files too.
 * @param {import("./config.js").Site} site
 * @param {import("./routes.js").Route[]} routes
 * @param {string[]} pages Each route's finished HTML
 */
export function checkLinks(site, routes, pages) {
  /** @param {string} file */
  const isFile = (file) => fs.statSync(path.join(site.out, file), { throwIfNoEntry: false })?.isFile() ?? false
  /** @type {Map<string, boolean>} */
  const exists = new Map()
  /** @type {Map<string, Set<string>>} A broken link -> the pages it's on */
  const broken = new Map()

  for (const [i, route] of routes.entries()) {
    const base = new URL(route.url, "http://mothwing.invalid")
    for (const link of pathLinks(pages[i])) {
      const { pathname } = new URL(link, base)
      let file
      try {
        file = decodeURIComponent(pathname)
      } catch {
        file = pathname
      }

      let found = exists.get(file)
      if (found === undefined) {
        // /about/ and /about are both the folder's index.html, as hosts serve them
        found = file.endsWith("/") ? isFile(`${file}index.html`) : isFile(file) || isFile(`${file}/index.html`)
        exists.set(file, found)
      }
      if (found) continue

      const on = broken.get(file) ?? new Set()
      broken.set(file, on)
      on.add(posix(path.relative(site.src, path.join(site.pages, route.source))))
    }
  }

  if (!broken.size) return
  const lines = [...broken].slice(0, SHOWN).map(([link, on]) => {
    const [first] = on
    return `  ${link} on ${first}${on.size > 1 ? ` and ${on.size - 1} more` : ""}`
  })
  if (broken.size > SHOWN) lines.push(`  and ${broken.size - SHOWN} more`)
  throw new Error(`${plural(broken.size, "link")} to nothing in the build:\n${lines.join("\n")}`)
}

/**
 * Warns about partials no page pasted in, left over from before.
 * @param {import("./config.js").Site} site
 * @param {import("./render.js").BuildState} state
 */
export function warnUnusedPartials(site, state) {
  const dir = path.join(site.src, site.partials)
  if (!fs.existsSync(dir)) return
  const used = new Set([...state.templates.values()].flatMap(template => [...template.partials]))
  const unused = fs.readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter(file => fs.statSync(path.join(dir, file)).isFile())
    .map(file => posix(path.relative(site.src, path.join(dir, file))))
    .filter(file => !used.has(file))
  if (!unused.length) return
  log("WARN", `${plural(unused.length, "partial")} not used by any page: ${unused.join(", ")}`)
}
