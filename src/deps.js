import esbuild from "esbuild"
import fs from "fs"
import path from "path"
import { posix } from "./log.js"

/**
 * @param {import("./config.js").Site} site
 * @param {string} file Relative to src
 * @returns {Promise<string[]>} It and every file in src it imports, however deep, relative to src
 */
async function importsOf(site, file) {
  try {
    const { metafile } = await esbuild.build({
      entryPoints: [path.join(site.src, file)],
      bundle: true,
      write: false,
      metafile: true,
      platform: "node",
      format: "esm",
      packages: "external",
      logLevel: "silent"
    })
    return Object.keys(metafile.inputs)
      .map(input => posix(path.relative(site.src, path.resolve(input))))
      .filter(input => !input.startsWith("../"))
  } catch {
    return [file]
  }
}

/**
 * The files each page is made from, so dev can render just the pages a change is in: the page, its partials, its
 * .data.js and what that imports, its sources, and the data files it used.
 * @param {import("./config.js").Site} site
 * @param {import("./render.js").BuildState} state
 * @param {import("./routes.js").Route[]} routes
 * @returns {Promise<Record<string, string[]>>} A page's file, relative to the pages folder -> files relative to src
 */
export async function dependencies(site, state, routes) {
  const pagesDir = posix(path.relative(site.src, site.pages))
  /** @type {Map<string, Promise<string[]>>} */
  const imports = new Map()
  /** @param {string} file */
  const importsCached = (file) => {
    if (!imports.has(file)) imports.set(file, importsOf(site, file))
    return /** @type {Promise<string[]>} */ (imports.get(file))
  }

  /** @type {Record<string, string[]>} */
  const deps = {}
  for (const source of new Set(routes.map(route => route.source))) {
    const files = new Set([`${pagesDir}/${source}`, ...state.templates.get(source)?.partials ?? []])
    for (const route of routes.filter(route => route.source === source)) route.sources.forEach(file => files.add(file))

    const dataFile = `${pagesDir}/${source.replace(/\.html$/, ".data.js")}`
    if (fs.existsSync(path.join(site.src, dataFile))) (await importsCached(dataFile)).forEach(file => files.add(file))

    // The data it used, and for a [projects.id].html page the list it's made from
    const fromData = source.match(/\[([\w.]+)\.\w+\]\.html$/)?.[1].split(".")[0]
    for (const name of new Set([...state.used.get(source) ?? [], ...fromData ? [fromData] : []])) {
      const file = state.data.files[name]
      if (!file) continue
      files.add(file)
      state.data.sources[name]?.forEach(input => files.add(input))
      if (file.endsWith(".js")) (await importsCached(file)).forEach(input => files.add(input))
    }
    deps[source] = [...files]
  }
  return deps
}

/**
 * @param {Record<string, string[]>} deps From dependencies
 * @param {string} file A changed file, relative to src
 * @returns {string[]} The pages made from it. A data folder counts for every file in it
 */
export const pagesUsing = (deps, file) => Object.entries(deps)
  .filter(([, files]) => files.some(dep => dep === file || file.startsWith(`${dep}/`)))
  .map(([source]) => source)
