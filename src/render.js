import crypto from "crypto"
import fs from "fs"
import path from "path"
import { posix } from "./log.js"
import { seoTags } from "./seo.js"
import { includeHtml, parseAttrs, parseTemplate, renderNodes } from "./template.js"

/*
  Tags, usable in any page or partial. Paths start at src, which the build mirrors:
  - <x-html src="partials/nav.html"/>      pastes in the partial, partials can include partials
  - <x-each>, <x-if>                       loops and conditions, see template.js
  - <x-js src="/js/index.js"/>             <script src="/js/index.js?v=hash">, add `module` for one of the config's
                                           modules, which also gets a modulepreload for each chunk it imports up front,
                                           and preload="/js/data/x.json" adds one for a file it import()s later
  - <x-css src="/css/index.css"/>          <link href="/css/index.css?v=hash" rel="stylesheet">
  - <x-seo title="..." description="..."/>  see seo.js
  - the config's own tags
*/

/**
 * What one build has worked out so far, shared by its pages.
 * @typedef {object} BuildState
 * @property {import("./data.js").SiteData} data The data folder
 * @property {Map<string, string>} assetUrls "/js/index.js" -> "/js/index.js?v=hash"
 * @property {Map<string, { nodes: import("./template.js").Node[], partials: Set<string> }>} templates A page's file ->
 *   its HTML with the partials pasted in, and which those were
 * @property {Map<string, Set<string>>} used A page's file -> the names its pages filled in, for what they depend on
 * @property {Map<string, string[]>} chunkImports "/js/gathering.js" -> the chunks it imports up front
 * @property {Map<string, string>} entryChunks "/js/data/x.json" -> "/js/chunks/x-hash.js"
 */

/** @returns {BuildState} */
export const buildState = () => ({
  data: { values: {}, files: {}, sources: {} },
  assetUrls: new Map(),
  templates: new Map(),
  used: new Map(),
  chunkImports: new Map(),
  entryChunks: new Map()
})

/**
 * @param {string} file "js/index.js" or "/js/index.js"
 * @returns {string} "/js/index.js"
 */
const sitePath = (file) => file.startsWith("/") ? file : `/${file}`

/**
 * @param {import("./config.js").Site} site
 * @param {BuildState} state
 * @param {string} from The page, for errors
 * @param {boolean} hashed Production builds add ?v=hash, so browsers and CDNs fetch it fresh after a deploy
 * @returns {Record<string, import("./config.js").TagFunction>}
 */
function coreTags(site, state, from, hashed) {
  /**
   * @param {string} tag
   * @param {Record<string, string | true>} attrs
   * @param {string} name
   */
  const need = (tag, attrs, name) => {
    const value = attrs[name]
    if (typeof value !== "string") throw new Error(`${from}: <${tag}> needs a ${name}="..."`)
    return value
  }

  /**
   * @param {string} tag
   * @param {string} file "/js/index.js"
   */
  const assetUrl = (tag, file) => {
    if (!hashed) return file
    let url = state.assetUrls.get(file)
    if (!url) {
      const built = path.join(site.out, file)
      if (!fs.existsSync(built)) throw new Error(`${from}: <${tag}> can't find ${file} in the build`)
      url = `${file}?v=${crypto.createHash("md5").update(fs.readFileSync(built)).digest("hex").slice(0, 8)}`
      state.assetUrls.set(file, url)
    }
    return url
  }

  return {
    "x-seo": ({ attrs, route }) => seoTags(site, route, attrs),
    "x-js": ({ attrs }) => {
      const file = sitePath(need("x-js", attrs, "src"))
      const preload = attrs.preload ? sitePath(need("x-js", attrs, "preload")) : null
      // Only known when the JS was built in this process, so not on dev renders
      if (preload && state.entryChunks.size && !state.entryChunks.has(preload)) {
        throw new Error(`${from}: <x-js preload="${preload}"> isn't imported by any of the modules`)
      }
      const chunks = [
        ...(attrs.module ? state.chunkImports.get(file) ?? [] : []),
        ...preload ? [state.entryChunks.get(preload) ?? []].flat() : []
      ]
      return [
        ...chunks.map(chunk => `<link rel="modulepreload" href="${chunk}">`),
        `<script${attrs.module ? " type=\"module\"" : ""} src="${assetUrl("x-js", file)}"></script>`
      ]
    },
    "x-css": ({ attrs }) => `<link href="${assetUrl("x-css", sitePath(need("x-css", attrs, "src")))}" type="text/css" rel="stylesheet">`
  }
}

/**
 * @param {import("./config.js").ActiveLink} decide The config's own say
 * @param {import("./routes.js").Route} route
 * @param {string} href
 * @returns {"page" | "section" | false}
 */
function activeLink(decide, route, href) {
  const own = decide(href, route)
  if (own !== undefined) return own
  if (href === route.url) return "page"
  if (href !== "/" && href.endsWith("/") && route.url.startsWith(href)) return "section"
  return false
}

/**
 * @param {import("./config.js").ActiveLink} decide
 * @param {import("./routes.js").Route} route
 * @param {string} html
 * @returns {string}
 */
const markActiveLinks = (decide, route, html) => html.replace(/<a\b([^>]*\bhref="([^"]+)"[^>]*)>/g, (tag, attrs, href) => {
  const active = activeLink(decide, route, href)
  return active ? `<a${attrs} aria-current="${active === "page" ? "page" : "true"}">` : tag
})

/**
 * @param {import("./config.js").Site} site
 * @param {BuildState} state
 * @param {import("./routes.js").Route} route
 * @param {boolean} hashed Add ?v=hash to the assets
 * @returns {string} The finished HTML, before minifying
 */
export function renderPage(site, state, route, hashed) {
  const from = posix(path.relative(site.src, path.join(site.pages, route.source)))
  let template = state.templates.get(route.source)
  if (template === undefined) {
    const partials = new Set()
    const html = includeHtml(site.src, fs.readFileSync(path.join(site.pages, route.source), "utf8"), from, partials)
    template = { nodes: parseTemplate(html, from), partials }
    state.templates.set(route.source, template)
  }

  const used = state.used.get(route.source) ?? new Set()
  state.used.set(route.source, used)
  const filled = renderNodes(template.nodes, { ...state.data.values, ...route.props }, { from, used })

  const tags = { ...site.tags, ...coreTags(site, state, from, hashed) }
  const transformed = site.transforms.reduce((html, transform) => transform(html, route, site), filled)

  // Tags on a line of their own are indented like it, every line of what they turn into
  const html = transformed.replace(/([ \t]*)<(x-[a-z][a-z-]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*\/?>/g, (tag, space, name, attrs, offset, page) => {
    if (!tags[name]) throw new Error(`${from}: unknown tag <${name}>`)
    const lineStart = offset === 0 || page[offset - 1] === "\n"
    const output = [tags[name]({ attrs: parseAttrs(attrs), route, site })].flat()
    return lineStart ? output.map(line => space + line).join("\n") : space + output.join("\n")
  })
  return site.activeLinks ? markActiveLinks(site.activeLinks, route, html) : html
}
