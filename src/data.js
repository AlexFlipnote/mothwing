import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import { posix } from "./log.js"

/**
 * The site's data folder, for every page.
 * @typedef {object} SiteData
 * @property {Record<string, any>} values projects.json -> values.projects, a folder is an object of its files
 * @property {Record<string, string>} files Each top level name -> its file or folder, relative to src
 * @property {Record<string, string[]>} sources Each top level name -> what its JS files say they're made from, see read
 */

/**
 * @param {string} file
 * @returns {Promise<{ value: any, sources: string[] }>} A JSON file as it is, a JS file's default export, called first
 *   when it's a function. A JS file can also `export const sources`, the files it reads (relative to src), so the pages
 *   using it are dated by them too, and render again in dev when they change
 */
async function read(file) {
  if (file.endsWith(".json")) return { value: JSON.parse(fs.readFileSync(file, "utf8")), sources: [] }
  const module = await import(pathToFileURL(file).href)
  const value = typeof module.default === "function" ? await module.default() : module.default
  return { value, sources: Array.isArray(module.sources) ? module.sources : [] }
}

/**
 * @param {string} dir
 * @param {string} from For errors, the folder relative to src
 * @param {(name: string, file: string, value: any, sources: string[]) => void} add Gets each file and folder in it
 */
async function readEach(dir, from, add) {
  const seen = new Set()
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    const name = entry.isDirectory() ? entry.name : entry.name.replace(/\.(json|js)$/, "")
    if (!entry.isDirectory() && name === entry.name) continue
    if (seen.has(name)) throw new Error(`${from}/${entry.name}: there's more than one ${name} in ${from}`)
    seen.add(name)

    if (entry.isDirectory()) {
      /** @type {Record<string, any>} */
      const values = {}
      /** @type {string[]} */
      const sources = []
      await readEach(file, `${from}/${entry.name}`, (inner, _, value, own) => {
        values[inner] = value
        sources.push(...own)
      })
      add(name, file, values, sources)
    } else {
      const { value, sources } = await read(file)
      add(name, file, value, sources)
    }
  }
}

/**
 * @param {import("./config.js").Site} site
 * @returns {Promise<SiteData>}
 */
export async function loadData(site) {
  const dir = path.join(site.src, site.data)
  /** @type {SiteData} */
  const data = { values: {}, files: {}, sources: {} }
  if (!fs.existsSync(dir)) return data

  await readEach(dir, site.data, (name, file, value, sources) => {
    data.values[name] = value
    data.files[name] = posix(path.relative(site.src, file))
    data.sources[name] = [...new Set(sources)]
  })
  return data
}
