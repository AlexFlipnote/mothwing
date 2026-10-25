import { execFileSync } from "child_process"
import fs from "fs"
import path from "path"
import { commonFolder } from "./assets.js"
import { log, posix } from "./log.js"

/**
 * Reads the history of the files the pages are made from, from one git log of the folder they're all in, rather than
 * one per page, which takes seconds on a big site.
 * @param {import("./config.js").Site} site
 * @param {string[]} files Relative to src
 * @returns {((files: string[]) => string) | null} Gets YYYY-MM-DD of the last commit that changed one of the files,
 *   null without git
 */
function commitDates(site, files) {
  /** @param {string[]} args */
  const git = (args) => execFileSync("git", args, {
    cwd: site.root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 1024 * 1024 * 1024
  })
  try {
    // git names files from the top of the repo, the root can be a folder in it
    const prefix = git(["rev-parse", "--show-prefix"]).trim()
    /** @param {string} file */
    const repoPath = (file) => path.posix.normalize(prefix + posix(path.relative(site.root, path.join(site.src, file))))

    /** @type {Map<string, { commit: number, date: string }>} Each file's last commit, by how many commits ago */
    const last = new Map()
    let commit = -1
    let date = ""
    // Newest first: each commit's \x01date, then the files it changed
    for (const entry of git(["log", "-z", "--format=%x01%cs", "--name-only", "--", `:/${commonFolder(files.map(repoPath))}`]).split("\0")) {
      const text = entry.replace(/^\n/, "")
      if (text.startsWith("\x01")) {
        commit++
        date = text.slice(1)
      } else if (text && !last.has(text)) last.set(text, { commit, date })
    }

    return (files) => {
      const newest = files.map(file => last.get(repoPath(file))).reduce((a, b) => !a || (b && b.commit < a.commit) ? b : a, undefined)
      // Not committed yet, so changed today
      return newest?.date ?? new Date().toISOString().slice(0, 10)
    }
  } catch {
    return null
  }
}

/**
 * Writes the CNAME, sitemaps and robots.txt, those the config turned on.
 * @param {import("./config.js").Site} site
 * @param {import("./routes.js").Route[]} routes
 * @param {boolean} [dated] Add each page's lastmod, from git, which takes a moment
 */
export async function writeSiteFiles(site, routes, dated = true) {
  const sitemapFiles = site.sitemap && (site.sitemap.sections.length ? "the sitemaps" : "the sitemap")
  const files = [site.cname && "CNAME", sitemapFiles, site.robots && "robots.txt"].filter(Boolean)
  if (!files.length) return
  log("SITE", `Writing ${files.length > 1 ? `${files.slice(0, -1).join(", ")} and ${files.at(-1)}` : files[0]}`)

  // Every GitHub Pages deploy wipes the branch, so the custom domain has to be written each time
  if (site.cname) fs.writeFileSync(path.join(site.out, "CNAME"), site.domain + "\n")

  /** @type {Map<string, { url: string, lastmod: string | null | false }[]>} */
  const sitemaps = new Map()
  if (site.sitemap) {
    const dates = dated && site.sitemap.dates ? commitDates(site, routes.flatMap(route => route.sources)) : null
    // With sections, a sitemap per section behind a sitemap index, so Search Console shows how each one is indexed on its own
    for (const route of routes.filter(route => route.source !== site.notFound)) {
      const section = route.url.split("/")[1]
      const name = site.sitemap.sections.includes(section) ? section : "pages"
      const pages = sitemaps.get(name) ?? []
      sitemaps.set(name, pages)
      pages.push({ url: route.url, lastmod: dates ? dates(route.sources) : false })
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

    /** @param {{ url: string, lastmod: string | null | false }[]} pages */
    const urlset = (pages) => xml("urlset", pages.map(p => entry("url", `${site.url}${p.url}`, p.lastmod)))

    if (!site.sitemap.sections.length) {
      fs.writeFileSync(path.join(site.out, "sitemap.xml"), urlset(sitemaps.get("pages") ?? []))
    } else {
      const index = []
      for (const [name, pages] of sitemaps) {
        const file = `sitemap-${name}.xml`
        fs.writeFileSync(path.join(site.out, file), urlset(pages))
        // YYYY-MM-DD sorts as text, so the newest is the last
        const newest = pages.map(p => p.lastmod).filter(Boolean).sort().at(-1)
        index.push(entry("sitemap", `${site.url}/${file}`, newest))
      }
      fs.writeFileSync(path.join(site.out, "sitemap.xml"), xml("sitemapindex", index))
    }
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

  log("SITE", site.sitemap ? `Done, ${[...sitemaps.values()].flat().length} pages in the sitemap` : "Done")
}
