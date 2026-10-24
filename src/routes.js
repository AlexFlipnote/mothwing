import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import { slug } from "./html.js"
import { posix } from "./log.js"
import { lookup } from "./template.js"

/**
 * A page to write. Most come one to a file in the pages folder, a [name].html file gives one per item.
 * Its props can have `files`, more files to write, by their path in the build.
 * @typedef {object} Route
 * @property {string} source "gathering/[item].html", relative to the pages folder
 * @property {string} output Where it goes in the build: "gathering/cedar-log/index.html"
 * @property {string} url "/gathering/cedar-log/"
 * @property {Record<string, any>} props Its own values, the data folder's are added when it's rendered
 * @property {string[]} sources Files its content comes from, relative to src, for the sitemap's lastmod
 */

/**
 * @param {string} dir
 * @param {string} pages The pages folder
 * @returns {string[]} Every .html file in it and its subfolders, relative to the pages folder
 */
const htmlFiles = (dir, pages = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(dir, entry.name)
  if (entry.isDirectory()) return htmlFiles(file, pages)
  return entry.name.endsWith(".html") ? [posix(path.relative(pages, file))] : []
})

/**
 * @param {import("./config.js").Site} site
 * @param {string} file "gathering/index.html", "404.html"
 * @returns {string} Where it goes in the build. Other names get their own folder, "about.html" -> "about/index.html"
 */
const pageOutput = (site, file) => file === site.notFound || file.endsWith("index.html") ? file : file.replace(/\.html$/, "/index.html")

/**
 * @param {string} output "gathering/index.html"
 * @returns {string} "/gathering/", "/" for index.html
 */
export const outputUrl = (output) => "/" + output.replace(/(^|\/)index\.html$/, "$1")

/**
 * One part of a URL, not starting with a dot, so not . or .. either
 * @param {string} slug
 */
const urlSafe = (slug) => /^[\w-][\w.-]*$/.test(slug)

/**
 * Every page, each folder's index.html first, so the front page leads the sitemap and a list comes before its items.
 * - about.html is one page. Its .data.js, when it has one, default exports `() => values`
 * - [projects.name].html is a page per item of the data folder's projects, by its name, the item is {{ page }}
 * - [name].html is a page per item its .data.js returns, each `{ slug, ...values }`
 * A .data.js can return a `sources` list (relative to src) of the files it's made from, for the sitemap's dates.
 * Two pages can't be written to the same place.
 * @param {import("./config.js").Site} site
 * @param {import("./data.js").SiteData} siteData
 * @param {Set<string>} [only] Just these pages, relative to the pages folder
 * @returns {Promise<Route[]>}
 */
export async function listRoutes(site, siteData, only) {
  const pagesDir = posix(path.relative(site.src, site.pages))
  /** @param {string} file */
  const sortKey = (file) => file.replace(/index\.html$/, "")
  const files = htmlFiles(site.pages)
    .filter(file => !only || only.has(file))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const routes = []

  for (const source of files) {
    const dataFile = source.replace(/\.html$/, ".data.js")
    const hasData = fs.existsSync(path.join(site.pages, dataFile))
    const own = [`${pagesDir}/${source}`, ...hasData ? [`${pagesDir}/${dataFile}`] : []]

    const fromData = source.match(/\[([\w.]+)\.(\w+)\]\.html$/)
    if (fromData) {
      if (hasData) throw new Error(`${pagesDir}/${source}: gets its pages from ${fromData[1]}, so it can't have a .data.js too`)
      routes.push(...pagesFromData(site, siteData, source, fromData[1], fromData[2]))
      continue
    }

    const data = hasData ? await (await import(pathToFileURL(path.join(site.pages, dataFile)).href)).default() : {}

    if (!/\[\w+\]\.html$/.test(source)) {
      const output = pageOutput(site, source)
      routes.push({ source, output, url: outputUrl(output), props: data, sources: [...own, ...data.sources ?? []] })
      continue
    }

    if (!hasData) {
      const name = source.match(/\[(\w+)\]\.html$/)?.[1]
      throw new Error(`${pagesDir}/${source}: needs to say what it makes pages of, like [projects.${name}].html for one per item of ${site.data}/projects, or have a .data.js that returns them`)
    }
    if (!Array.isArray(data)) throw new Error(`${pagesDir}/${dataFile}: a [name].html page needs a list of pages`)
    const seen = new Set()
    for (const [i, { slug, sources = [], ...props }] of data.entries()) {
      if (slug == null || slug === "") throw new Error(`${pagesDir}/${dataFile}: page ${i} has no slug`)
      if (!urlSafe(String(slug))) throw new Error(`${pagesDir}/${dataFile}: page ${i}'s slug "${slug}" isn't safe in a URL, slug() from mothwing/html makes it so`)
      if (seen.has(slug)) throw new Error(`${pagesDir}/${dataFile}: two pages are both "${slug}"`)
      seen.add(slug)
      const output = source.replace(/\[\w+\]\.html$/, `${slug}/index.html`)
      // Dated by its data alone, a template tweak would otherwise date thousands of pages at once
      routes.push({ source, output, url: outputUrl(output), props, sources: sources.length ? sources : own })
    }
  }

  // A [name].html page can land on another file's page, which would quietly win
  const outputs = new Map()
  for (const { source, output } of routes) {
    const other = outputs.get(output)
    if (other && other !== source) throw new Error(`${pagesDir}/${source}: makes ${output}, which ${pagesDir}/${other} makes too`)
    outputs.set(output, source)
  }
  return routes
}

/**
 * A page per item of a list in the data folder.
 * @param {import("./config.js").Site} site
 * @param {import("./data.js").SiteData} siteData
 * @param {string} source "projects/[projects.name].html"
 * @param {string} list "projects"
 * @param {string} key "name", what each item's slug is made from
 * @returns {Route[]}
 */
function pagesFromData(site, siteData, source, list, key) {
  const from = posix(path.relative(site.src, path.join(site.pages, source)))
  const items = lookup(siteData.values, list)
  if (!Array.isArray(items)) throw new Error(`${from}: ${site.data} has no list called ${list}`)
  const top = list.split(".")[0]
  const dataSources = [siteData.files[top], ...siteData.sources[top] ?? []]

  const seen = new Set()
  return items.map((item, i) => {
    if (item?.[key] === undefined) throw new Error(`${from}: item ${i} of ${list} has no ${key}`)
    // A value that's fine in a URL already is kept as it is, so existing links like /docs/create_ssh_key/ keep working
    const value = String(item[key])
    const pageSlug = urlSafe(value) ? value : slug(value)
    if (!pageSlug) throw new Error(`${from}: item ${i} of ${list} has an empty ${key}`)
    if (seen.has(pageSlug)) throw new Error(`${from}: two of ${list} are both "${pageSlug}"`)
    seen.add(pageSlug)
    const output = source.replace(/\[[\w.]+\]\.html$/, `${pageSlug}/index.html`)
    // Dated by its data alone, a template tweak would otherwise date every page at once. An item can say which of the
    // data it's made from, so a change to one doesn't date them all
    const sources = Array.isArray(item.sources) && item.sources.length ? item.sources : dataSources
    return { source, output, url: outputUrl(output), props: { page: item }, sources }
  })
}
