import crypto from "crypto"
import esbuild from "esbuild"
import fs from "fs"
import path from "path"
import { log, posix } from "./log.js"

/**
 * @param {import("./config.js").Site} site
 * @param {string} file Absolute path
 * @returns {boolean} In one of the config's exclude folders
 */
export const isExcluded = (site, file) => {
  const relative = posix(path.relative(site.src, file))
  return site.exclude.some(dir => relative === dir || relative.startsWith(`${dir}/`))
}

/**
 * Removes the build folder, what the production build starts with.
 * @param {import("./config.js").Site} site
 */
export async function clean(site) {
  log("CLEAN", "Removing build folder...")
  // Retries, as the dev server can be writing a file into it right then
  await fs.promises.rm(site.out, { recursive: true, force: true, maxRetries: 5 })
  log("CLEAN", "Done")
}

/**
 * @param {import("./config.js").Site} site
 * @param {string} file Absolute path
 * @returns {boolean} Copied into the build as it is: not in an excluded folder, a page or Sass
 */
const isAsset = (site, file) => !isExcluded(site, file) && !/\.(html|scss|sass)$/.test(file)

/**
 * Copies src as it is into the build, leaving out the excluded folders, pages and Sass.
 * @param {import("./config.js").Site} site
 * @param {string} [file] Just this one, an absolute path, as dev does when it changes
 */
export async function copyAssets(site, file) {
  if (file) {
    if (isAsset(site, file)) fs.cpSync(file, path.join(site.out, path.relative(site.src, file)))
    return
  }
  log("ASSET", "Copying assets...")
  fs.cpSync(site.src, site.out, { recursive: true, filter: (file) => isAsset(site, file) })
  log("ASSET", "Done copying assets")
}

/**
 * @param {string[]} files "js/a.js", "js/pages/b.js"
 * @returns {string} The folder they're all in, "js"
 */
export function commonFolder(files) {
  const [first = [], ...rest] = files.map(file => path.posix.dirname(file).split("/"))
  let depth = first.length
  for (const parts of rest) {
    while (depth && parts.slice(0, depth).join("/") !== first.slice(0, depth).join("/")) depth--
  }
  return first.slice(0, depth).join("/").replace(/^\.$/, "")
}

/**
 * The esbuild builds for the config's js: one per script, and one for all the modules, so they can share chunks.
 * @param {import("./config.js").Site} site
 * @param {import("esbuild").BuildOptions} [overrides]
 * @returns {import("esbuild").BuildOptions[]}
 */
export function jsBuilds(site, overrides = {}) {
  /** @param {import("esbuild").BuildOptions} build */
  const options = (build) => ({
    bundle: true,
    minify: true,
    sourcemap: false,
    target: ["es2020"],
    ...site.esbuild,
    ...build,
    ...overrides
  })
  const { scripts, modules, chunks } = site.js
  // From the modules' own folder, as esbuild's chunk hashes depend on the paths the build is laid out with
  const base = commonFolder(modules)

  return [
    ...scripts.map(file => options({ entryPoints: [path.join(site.src, file)], outfile: path.join(site.out, file), format: "iife" })),
    ...modules.length
      ? [options({
        entryPoints: modules.map(file => path.join(site.src, file)),
        outbase: path.join(site.src, base),
        outdir: path.join(site.out, base),
        format: "esm",
        splitting: true,
        chunkNames: `${path.posix.relative(base, chunks) || "."}/[name]-[hash]`
      })]
      : []
  ]
}

/**
 * Bundles the JS, and notes which chunks each file imports, for the modulepreload links.
 * @param {import("./config.js").Site} site
 * @param {import("./render.js").BuildState} state
 */
export async function buildJS(site, state) {
  const builds = jsBuilds(site, { metafile: true })
  if (!builds.length) return
  log("JS", "Building JS...")
  const results = await Promise.all(builds.map(build => esbuild.build(build)))

  /** @param {string} file */
  const url = (file) => "/" + posix(path.relative(site.out, path.resolve(file)))
  for (const [file, output] of results.flatMap(r => Object.entries(r.metafile?.outputs ?? {}))) {
    const imports = output.imports.filter(i => i.kind === "import-statement").map(i => url(i.path))
    if (imports.length) state.chunkImports.set(url(file), imports)
    if (output.entryPoint) state.entryChunks.set("/" + posix(path.relative(site.src, output.entryPoint)), url(file))
  }
  log("JS", "Done building the JS")
}

/** @param {import("./config.js").Site} site */
export async function buildSass(site) {
  const files = Object.entries(site.sass)
  if (!files.length) return
  log("CSS", "Converting SCSS to CSS")
  const sass = await import("sass").catch(() => {
    throw new Error("The config has sass to compile, which needs it installed: npm install sass")
  })
  for (const [from, to] of files) {
    const result = sass.compile(path.join(site.src, from), { style: "compressed" })
    const outputFile = path.join(site.out, to)
    fs.mkdirSync(path.dirname(outputFile), { recursive: true })
    fs.writeFileSync(outputFile, result.css)
  }
  log("CSS", "Done building the CSS")
}

/**
 * How every hashed link is made, the JS and CSS ones and asset()'s alike.
 * @param {string} file Its path in the build: "/search.json"
 * @param {string | Uint8Array} content
 * @returns {string} "/search.json?v=1a2b3c4d", which changes when the content does
 */
export const hashedUrl = (file, content) => `${file}?v=${crypto.createHash("md5").update(content).digest("hex").slice(0, 8)}`

/** A file the build writes, made by asset(). As text, it's the URL to link to it by. */
export class Asset {
  /**
   * @param {string} file Where it goes in the build: "search.json"
   * @param {string | Uint8Array} content
   */
  constructor(file, content) {
    const normalized = `/${file}`.replace(/\\/g, "/").replace(/\/{2,}/g, "/")
    if (normalized.split("/").includes("..")) throw new Error(`asset("${file}"): the path has to stay in the build`)
    /** Its path in the build, "/search.json" */
    this.path = normalized
    /** What's written */
    this.content = content
    /** The path with a hash of the content, which changes when the content does: "/search.json?v=1a2b3c4d" */
    this.url = hashedUrl(normalized, content)
  }

  /** The URL, so {{ }} and html`...` put it in as it is */
  toString() {
    return this.url
  }
}

/**
 * A file for the build, made from data: a search index, a feed, a generated image. The build writes it, and a page
 * links to it by this value, its URL with a hash of the content, like the JS and CSS links:
 * `<input data-index="{{ search.index }}">` -> `data-index="/search.json?v=1a2b3c4d"`. The hash only changes when the
 * content does, so browsers and CDNs can keep it until then.
 * @param {string} file Where it goes in the build: "search.json"
 * @param {string | Uint8Array} content
 * @returns {Asset}
 */
export const asset = (file, content) => new Asset(file, content)
