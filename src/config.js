import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"

export const CONFIG_FILE = "mothwing.config.js"

/**
 * What a site's mothwing.config.js default exports. Only `domain` is needed. Paths are relative to `src` unless they
 * say otherwise. The extras (minify to activeLinks) are off until asked for: `true` turns one on as it comes, an object
 * with its own settings.
 * @typedef {object} Config
 * @property {string} domain "example.com", for the canonical URLs, sitemaps and CNAME
 * @property {string} [src] The source folder, relative to the config. "src"
 * @property {string} [out] The build folder, relative to the config. "dist"
 * @property {string} [pages] The pages folder. "pages"
 * @property {string} [data] The data folder, its files are in every page by their name: projects.json -> {{ projects }}.
 *   "data"
 * @property {string} [notFound] The 404 page, in the pages folder. Kept in the build's root, out of the sitemap. "404.html"
 * @property {JsConfig} [js] The JS to bundle
 * @property {Record<string, string>} [sass] Sass to compile, source to output: { "scss/index.scss": "css/index.css" }
 * @property {string[]} [exclude] Folders left out of the build, on top of pages, partials and data: ["js", "scss"]
 * @property {string[]} [rerender] Folders the pages read with fs, whose changes render every page again in dev. What
 *   the pages import, include or use from the data folder is followed on its own
 * @property {SeoConfig} [seo] For <x-seo>
 * @property {boolean | import("html-minifier-terser").Options} [minify] Minify the HTML of production builds
 * @property {boolean | Record<string, string>} [csp] A Content-Security-Policy <meta> that allows only the site's own
 *   files and inline scripts. An object sets directives over the defaults: { "style-src": "'self' 'unsafe-inline'" }
 * @property {boolean | SitemapConfig} [sitemap] sitemap.xml
 * @property {boolean | RobotsConfig} [robots] robots.txt
 * @property {boolean} [cname] A CNAME file with the domain, for GitHub Pages
 * @property {boolean | ActiveLink} [activeLinks] aria-current on links to the page they're on and to its section
 * @property {Record<string, TagFunction>} [tags] Your own tags: { "x-name": ({ attrs }) => "<b>html</b>" }
 * @property {Transform[]} [transforms] Run on every page's HTML once its placeholders are filled
 * @property {Hook[]} [after] Run once the pages are written
 * @property {import("esbuild").BuildOptions} [esbuild] esbuild options for every bundle, over mothwing's
 */

/**
 * Each file is bundled to the same path in the build, js/index.js -> /js/index.js.
 * @typedef {object} JsConfig
 * @property {string[]} [scripts] For <x-js src="..."/>, bundled on their own
 * @property {string[]} [modules] For <x-js src="..." module/>, ES modules that share their common code in chunks
 * @property {string} [chunks] Where the shared chunks go. A chunks folder next to the first module
 */

/**
 * @typedef {object} SeoConfig
 * @property {string} [siteName] Added to titles that fit, and the link previews' site name. The domain
 * @property {string} [locale] "en_US"
 * @property {{ src: string, width: number, height: number, alt: string } | null} [image] The link preview for pages
 *   without their own
 * @property {number} [maxTitle] Titles longer than this leave out the site name, search results cut them off. 60
 * @property {number} [maxDescription] Longer descriptions are cut at a word. 160
 */

/**
 * @typedef {object} SitemapConfig
 * @property {string[]} [sections] Sections that get a sitemap of their own behind a sitemap index, the rest share
 *   sitemap-pages.xml. Without any, sitemap.xml has every page itself
 * @property {boolean} [dates] Date each page by the last git commit to its files. true
 */

/**
 * @typedef {object} RobotsConfig
 * @property {string[]} [block] Crawlers turned away from the whole site, by name
 * @property {string[]} [disallow] Paths kept out of every crawler
 */

/**
 * Returns the HTML a tag turns into. A list is one line each, indented like the tag.
 * @typedef {(tag: { attrs: Record<string, string | true>, route: import("./routes.js").Route, site: Site }) => string | string[]} TagFunction
 * @typedef {(html: string, route: import("./routes.js").Route, site: Site) => string} Transform
 * @typedef {(build: { site: Site, routes: import("./routes.js").Route[], dev: boolean }) => any} Hook
 */

/**
 * Decides what a link on a page is to it: "page" for the page itself, "section" for a section it's in, false for
 * neither. undefined leaves it to the default.
 * @typedef {(href: string, route: import("./routes.js").Route) => "page" | "section" | false | undefined} ActiveLink
 */

/**
 * The config with its defaults filled in, its folders absolute, and each extra either false or its settings.
 * @typedef {object} Site
 * @property {string} domain
 * @property {string} url "https://example.com"
 * @property {string} root The config's folder
 * @property {string} src
 * @property {string} out
 * @property {string} pages
 * @property {string} data Relative to src
 * @property {string} notFound
 * @property {Required<JsConfig>} js
 * @property {Record<string, string>} sass
 * @property {string[]} exclude Folders, with pages, partials and data
 * @property {string[]} rerender Folders
 * @property {Required<SeoConfig>} seo
 * @property {import("html-minifier-terser").Options | false} minify
 * @property {Record<string, string> | false} csp
 * @property {Required<SitemapConfig> | false} sitemap
 * @property {Required<RobotsConfig> | false} robots
 * @property {boolean} cname
 * @property {ActiveLink | false} activeLinks
 * @property {Record<string, TagFunction>} tags
 * @property {Transform[]} transforms
 * @property {Hook[]} after
 * @property {import("esbuild").BuildOptions} esbuild
 */

const OPTIONS = [
  "domain", "src", "out", "pages", "data", "notFound", "js", "sass", "exclude", "rerender", "seo", "minify", "csp", "sitemap",
  "robots", "cname", "activeLinks", "tags", "transforms", "after", "esbuild"
]

const DEFAULT_CSP = {
  "default-src": "'self'",
  "script-src": "'self'",
  "style-src": "'self'",
  "img-src": "'self' data:",
  "object-src": "'none'",
  "base-uri": "'none'",
  "form-action": "'none'"
}

const DEFAULT_MINIFY = {
  collapseWhitespace: true,
  removeComments: true,
  minifyJS: true,
  minifyCSS: true
}

/**
 * @template T
 * @param {boolean | T | undefined} value
 * @returns {Partial<T>} The settings of an extra turned on with an object, none for `true`
 */
const settings = (value) => typeof value === "object" ? value : {}

/**
 * Gives the config its types in your editor, it's returned as it is.
 * @param {Config} config
 * @returns {Config}
 */
export const defineConfig = (config) => config

/**
 * @param {Config} config
 * @param {string} root The config's folder
 * @returns {Site}
 */
export function resolveConfig(config, root) {
  if (!config?.domain) throw new Error(`${CONFIG_FILE}: needs a domain`)
  const unknown = Object.keys(config).filter(key => !OPTIONS.includes(key))
  if (unknown.length) throw new Error(`${CONFIG_FILE}: unknown option ${unknown.map(key => `"${key}"`).join(", ")}, the options are ${OPTIONS.join(", ")}`)

  const src = path.resolve(root, config.src ?? "src")
  const pages = config.pages ?? "pages"
  const data = config.data ?? "data"
  const modules = config.js?.modules ?? []

  return {
    domain: config.domain,
    url: `https://${config.domain}`,
    root,
    src,
    out: path.resolve(root, config.out ?? "dist"),
    pages: path.join(src, pages),
    data,
    notFound: config.notFound ?? "404.html",
    js: {
      scripts: config.js?.scripts ?? [],
      modules,
      chunks: config.js?.chunks ?? (modules.length ? path.posix.join(path.posix.dirname(modules[0]), "chunks") : "chunks")
    },
    sass: config.sass ?? {},
    exclude: [...new Set([pages, "partials", data, ...config.exclude ?? []])],
    rerender: config.rerender ?? [],
    seo: {
      siteName: config.domain,
      locale: "en_US",
      image: null,
      maxTitle: 60,
      maxDescription: 160,
      ...config.seo
    },
    minify: config.minify ? { ...DEFAULT_MINIFY, ...settings(config.minify) } : false,
    csp: config.csp ? { ...DEFAULT_CSP, ...settings(config.csp) } : false,
    sitemap: config.sitemap ? { sections: [], dates: true, ...settings(config.sitemap) } : false,
    robots: config.robots ? { block: [], disallow: [], ...settings(config.robots) } : false,
    cname: config.cname ?? false,
    activeLinks: config.activeLinks === true ? () => undefined : config.activeLinks || false,
    tags: config.tags ?? {},
    transforms: config.transforms ?? [],
    after: config.after ?? [],
    esbuild: config.esbuild ?? {}
  }
}

/**
 * @param {string} [root] The folder with mothwing.config.js
 * @returns {Promise<Site>}
 */
export async function loadConfig(root = process.cwd()) {
  const file = path.join(root, CONFIG_FILE)
  if (!fs.existsSync(file)) throw new Error(`No ${CONFIG_FILE} in ${root}`)
  return resolveConfig((await import(pathToFileURL(file).href)).default, path.resolve(root))
}
