import { execFileSync } from "child_process"
import fs from "fs"
import path from "path"
import { log, posix } from "./log.js"

/**
 * @param {import("./config.js").Site} site
 * @param {Map<string, string | null>} cache Sorted file list -> its lastmod, many pages are made from the same files
 * @param {string[]} files Relative to src
 * @returns {string | null} YYYY-MM-DD of the last commit that changed one of them, null without git
 */
function lastModified(site, cache, files) {
  const key = [...new Set(files)].sort().join("|")
  if (!cache.has(key)) {
    try {
      const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", ...key.split("|").map(f => posix(path.relative(site.root, path.join(site.src, f))))], {
        cwd: site.root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim()
      // Not committed yet, so changed today
      cache.set(key, date || new Date().toISOString().slice(0, 10))
    } catch {
      cache.set(key, null)
    }
  }
  return cache.get(key) ?? null
}

/**
 * Writes CNAME, the sitemaps and robots.txt.
 * @param {import("./config.js").Site} site
 * @param {import("./routes.js").Route[]} routes
 * @param {boolean} [dated] Add each page's lastmod, from git, which takes a moment
 */
export async function writeSiteFiles(site, routes, dated = true) {
  log("SITE", "Writing CNAME, the sitemaps and robots.txt")

  // Every GitHub Pages deploy wipes the branch, so the custom domain has to be written each time
  if (site.cname) fs.writeFileSync(path.join(site.out, "CNAME"), site.domain + "\n")

  /** @type {Map<string, { url: string, lastmod: string | null | false }[]>} */
  const sitemaps = new Map()
  if (site.sitemap) {
    const cache = new Map()
    // A sitemap per section behind a sitemap index, so Search Console shows how each one is indexed on its own
    for (const route of routes.filter(route => route.source !== site.notFound)) {
      const section = route.url.split("/")[1]
      const name = site.sitemap.sections.includes(section) ? section : "pages"
      const pages = sitemaps.get(name) ?? []
      sitemaps.set(name, pages)
      pages.push({ url: route.url, lastmod: dated && site.sitemap.dates && lastModified(site, cache, route.sources) })
    }

    /**
     * @param {string} tag
     * @param {string[]} entries
     */
    const xml = (tag, entries) => [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      `<${tag} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      ...entries,
      `</${tag}>`,
      ""
    ].join("\n")
    /**
     * @param {string} tag
     * @param {string} loc
     * @param {string | null | false | undefined} lastmod
     */
    const entry = (tag, loc, lastmod) => `  <${tag}><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</${tag}>`

    const index = []
    for (const [name, pages] of sitemaps) {
      const file = `sitemap-${name}.xml`
      fs.writeFileSync(path.join(site.out, file), xml("urlset", pages.map(p => entry("url", `${site.url}${p.url}`, p.lastmod))))
      // YYYY-MM-DD sorts as text, so the newest is the last
      const newest = pages.map(p => p.lastmod).filter(Boolean).sort().at(-1)
      index.push(entry("sitemap", `${site.url}/${file}`, newest))
    }
    fs.writeFileSync(path.join(site.out, "sitemap.xml"), xml("sitemapindex", index))
  }

  if (site.robots) {
    fs.writeFileSync(path.join(site.out, "robots.txt"), [
      ...site.robots.block.flatMap(bot => [`User-agent: ${bot}`, "Disallow: /", ""]),
      "User-agent: *",
      "Allow: /",
      ...site.robots.disallow.map(dir => `Disallow: ${dir}`),
      "",
      ...site.sitemap ? [`Sitemap: ${site.url}/sitemap.xml`, ""] : []
    ].join("\n"))
  }

  log("SITE", `Done, ${[...sitemaps.values()].flat().length} pages in the sitemap`)
}
