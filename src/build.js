import fs from "fs"
import path from "path"
import { buildJS, buildSass, clean, copyAssets } from "./assets.js"
import { withCsp } from "./csp.js"
import { loadData } from "./data.js"
import { dependencies } from "./deps.js"
import { Asset, Html } from "./html.js"
import { log } from "./log.js"
import { minifyHtml } from "./minify.js"
import { buildState, renderPage } from "./render.js"
import { listRoutes } from "./routes.js"
import { writeSiteFiles } from "./site.js"

/**
 * Writes a file unless it already has this content. Writing is much slower than reading on Windows, and a dev render
 * of a whole site mostly writes what's already there.
 * @param {string} file
 * @param {string | Uint8Array} content
 * @returns {boolean} Whether it was written
 */
export function writeIfChanged(file, content) {
  try {
    const old = fs.readFileSync(file)
    if (typeof content === "string" ? old.toString("utf8") === content : old.equals(content)) return false
  } catch {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }
  fs.writeFileSync(file, content)
  return true
}

/**
 * @param {any} value Data, however deep
 * @param {Map<string, Asset>} found Each asset() in it, by its path
 * @param {Set<object>} [seen] What's looked through already, as the same item is in the data folder and its page
 */
function findAssets(value, found, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value) || value instanceof Html || ArrayBuffer.isView(value)) return
  seen.add(value)
  if (value instanceof Asset) {
    const known = found.get(value.path)
    if (known && known.url !== value.url) throw new Error(`asset("${value.path}") is made twice, with different content`)
    found.set(value.path, value)
    return
  }
  for (const inner of Array.isArray(value) ? value : Object.values(value)) findAssets(inner, found, seen)
}

/**
 * @param {import("./config.js").Site} site
 * @param {import("./render.js").BuildState} state
 * @param {{ hashed?: boolean, only?: Set<string> }} [options] `hashed` for production: hashed asset links and minified
 *   HTML. `only` renders just these pages, relative to the pages folder
 * @returns {Promise<{ routes: import("./routes.js").Route[], written: number }>} The pages rendered, and how many of
 *   them and their files were written
 */
export async function buildHTML(site, state, { hashed = true, only } = {}) {
  log("HTML", only ? `Rendering ${[...only].join(", ")}...` : "Rendering pages...")
  state.assetUrls.clear()
  state.templates.clear()
  state.used.clear()
  state.data = await loadData(site)

  const routes = await listRoutes(site, state.data, only)
  let written = 0
  let files = 0

  // The data's asset()s, written before the pages that link to them
  /** @type {Map<string, Asset>} */
  const assets = new Map()
  const seen = new Set()
  findAssets(state.data.values, assets, seen)
  for (const route of routes) findAssets(route.props, assets, seen)
  for (const asset of assets.values()) {
    if (writeIfChanged(path.join(site.out, asset.path), asset.content)) files++
  }

  for (const route of routes) {
    const html = renderPage(site, state, route, hashed)
    const finished = hashed && site.minify ? await minifyHtml(html).catch(error => { throw new Error(`${route.source}: ${error.message}`) }) : html
    if (writeIfChanged(path.join(site.out, route.output), site.csp ? withCsp(site.csp, finished) : finished)) written++

    for (const [file, content] of Object.entries(route.props.files ?? {})) {
      if (writeIfChanged(path.join(site.out, file), content)) files++
    }
  }

  // A page that used the data folder is dated by it too, and by what its files say they're made from
  for (const route of routes) {
    if (route.props.page) continue
    for (const name of state.used.get(route.source) ?? []) {
      const file = state.data.files[name]
      if (!file || name in route.props) continue
      for (const source of [file, ...state.data.sources[name] ?? []]) {
        if (!route.sources.includes(source)) route.sources.push(source)
      }
    }
  }
  log("HTML", `Done rendering ${routes.length} pages${written < routes.length ? `, ${written} changed` : ""}`)
  return { routes, written: written + files }
}

/**
 * @param {import("./config.js").Site} site
 * @param {import("./routes.js").Route[]} routes
 * @param {boolean} dev
 */
async function runAfter(site, routes, dev) {
  for (const hook of site.after) await hook({ site, routes, dev })
}

/**
 * Renders the pages into an existing build, as dev does after a change. With `only`, just those pages, and the
 * sitemaps are left as they are.
 * @param {import("./config.js").Site} site
 * @param {{ only?: Set<string> }} [options]
 * @returns {Promise<{ deps: Record<string, string[]>, written: number }>} What each page rendered is made from, see
 *   deps.js, and how many of the pages and their files were written, the rest were as they are
 */
export async function renderSite(site, { only } = {}) {
  const state = buildState()
  const { routes, written } = await buildHTML(site, state, { hashed: false, only })
  if (!only) await writeSiteFiles(site, routes, false)
  await runAfter(site, routes, true)
  return { deps: await dependencies(site, state, routes), written }
}

/**
 * The production build, from an empty build folder.
 * @param {import("./config.js").Site} site
 */
export async function build(site) {
  const state = buildState()
  await clean(site)
  await copyAssets(site)
  await buildJS(site, state)
  await buildSass(site)
  // After JS and CSS, since the ?v=hash is made from the built files
  const { routes } = await buildHTML(site, state)
  await writeSiteFiles(site, routes)
  await runAfter(site, routes, false)
}
