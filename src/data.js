import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import { posix } from "./log.js"

/**
 * The site's data folder, for every page.
 * @typedef {object} SiteData
 * @property {Record<string, any>} values projects.json -> values.projects, a folder is an object of its files
 * @property {Record<string, string>} files Each top level name -> its file or folder, relative to src
 */

/**
 * @param {string} file
 * @returns {Promise<any>} A JSON file as it is, a JS file's default export, called first when it's a function
 */
async function read(file) {
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"))
  const value = (await import(pathToFileURL(file).href)).default
  return typeof value === "function" ? await value() : value
}

/**
 * @param {string} dir
 * @param {string} from For errors, the folder relative to src
 * @returns {Promise<Record<string, any>>}
 */
async function readFolder(dir, from) {
  /** @type {Record<string, any>} */
  const values = {}
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    const name = entry.isDirectory() ? entry.name : entry.name.replace(/\.(json|js)$/, "")
    if (!entry.isDirectory() && name === entry.name) continue
    if (name in values) throw new Error(`${from}/${entry.name}: there's more than one ${name} in ${from}`)
    values[name] = entry.isDirectory() ? await readFolder(file, `${from}/${entry.name}`) : await read(file)
  }
  return values
}

/**
 * @param {import("./config.js").Site} site
 * @returns {Promise<SiteData>}
 */
export async function loadData(site) {
  const dir = path.join(site.src, site.data)
  if (!fs.existsSync(dir)) return { values: {}, files: {} }

  const values = await readFolder(dir, site.data)
  const files = Object.fromEntries(fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() || /\.(json|js)$/.test(entry.name))
    .map(entry => [entry.isDirectory() ? entry.name : entry.name.replace(/\.(json|js)$/, ""), posix(path.join(site.data, entry.name))]))
  return { values, files }
}
