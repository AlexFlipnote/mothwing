import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { loadData } from "../src/data.js"
import { pagesUsing } from "../src/deps.js"
import { listRoutes } from "../src/routes.js"
import { writeSiteFiles } from "../src/site.js"
import { build, loadConfig, renderSite, resolveConfig } from "../src/index.js"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture")
const OUT = path.join(ROOT, "dist")

/** @param {string} file Relative to the build folder */
const read = (file) => fs.readFileSync(path.join(OUT, file), "utf8")

/** @param {import("../src/config.js").Site} site */
async function quietBuild(site) {
  const log = console.log
  console.log = () => {}
  try {
    await build(site)
  } finally {
    console.log = log
  }
}

describe("build with nothing turned on", () => {
  const out = path.join(ROOT, "dist-bare")

  before(async () => {
    const { tags } = (await import("./fixture/mothwing.config.js")).default
    await quietBuild(resolveConfig({ domain: "example.com", out: "dist-bare", tags }, ROOT))
  })

  it("writes the pages and nothing extra", () => {
    assert.ok(fs.existsSync(path.join(out, "posts/first/index.html")))
    for (const file of ["CNAME", "robots.txt", "sitemap.xml"]) assert.ok(!fs.existsSync(path.join(out, file)), file)
  })

  it("leaves the HTML as written", () => {
    const page = fs.readFileSync(path.join(out, "posts/index.html"), "utf8")
    assert.ok(!page.includes("Content-Security-Policy"))
    assert.ok(!page.includes("aria-current"))
    assert.match(page, /\n {4}<nav>\r?\n/)
  })
})

describe("build", () => {
  before(async () => quietBuild(await loadConfig(ROOT)))

  it("writes a page per file, and one per entry of a [name].html page", () => {
    for (const file of ["index.html", "posts/index.html", "posts/first/index.html", "posts/second/index.html", "404.html"]) {
      assert.ok(fs.existsSync(path.join(OUT, file)), file)
    }
  })

  it("copies the assets and bundles the JS", () => {
    assert.equal(read("css/site.css").trim(), "body { margin: 0 }")
    assert.ok(read("js/main.js").includes("ready"))
    assert.ok(!fs.existsSync(path.join(OUT, "partials")))
    assert.ok(!fs.existsSync(path.join(OUT, "pages")))
    assert.ok(!fs.existsSync(path.join(OUT, "js/shared.js")), "excluded, it's bundled")
  })

  it("splits the modules' shared code into chunks, and preloads them", () => {
    const chunks = fs.readdirSync(path.join(OUT, "js/chunks"))
    assert.ok(chunks.length >= 2, "the shared code, and the lazy import")
    const page = read("posts/index.html")
    const preloads = [...page.matchAll(/<link rel="modulepreload" href="(\/js\/chunks\/[^"]+)">/g)].map(([, href]) => href)
    assert.ok(preloads.some(href => href.includes("lazy")), "preload=\"/js/data/lazy.js\"")
    assert.ok(preloads.length >= 2, "and the chunk app.js imports up front")
    assert.match(page, /<script type="module" src="\/js\/app\.js\?v=[0-9a-f]{8}"><\/script>/)
  })

  it("escapes {{ }} and leaves {{{ }}} as HTML", () => {
    assert.ok(read("index.html").includes("Tom &amp; Jerry &lt;3"))
    assert.ok(read("posts/first/index.html").includes("<p>One</p><p>Two</p>"))
  })

  it("links the assets with a hash", () => {
    const page = read("index.html")
    assert.match(page, /<script src="\/js\/main\.js\?v=[0-9a-f]{8}"><\/script>/)
    assert.match(page, /<link href="\/css\/site\.css\?v=[0-9a-f]{8}" type="text\/css" rel="stylesheet">/)
  })

  it("writes the SEO tags", () => {
    const page = read("posts/first/index.html")
    assert.ok(page.includes("<title>First - Example</title>"))
    assert.ok(page.includes("<link rel=\"canonical\" href=\"https://example.com/posts/first/\">"))
    assert.ok(page.includes("\"name\":\"Posts\",\"item\":\"https://example.com/posts/\""))
    assert.ok(read("index.html").includes("\"@type\":\"WebSite\",\"name\":\"Example\""))
  })

  it("allows the inline scripts by their hash, and nothing else", () => {
    const csp = read("index.html").match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? ""
    assert.ok(csp.startsWith("default-src 'self'; script-src 'self' 'sha256-"))
    assert.ok(read("posts/index.html").includes("script-src 'self'; "))
  })

  it("marks the active links", () => {
    assert.ok(read("posts/index.html").includes("<a href=\"/posts/\" aria-current=\"page\">"))
    assert.ok(read("posts/first/index.html").includes("<a href=\"/posts/\" aria-current=\"true\">"))
    assert.ok(read("index.html").includes("<a href=\"/\" aria-current=\"page\">"))
    assert.ok(read("index.html").includes("<a href=\"/posts/\">"))
  })

  it("lets the config decide links itself", () => {
    assert.ok(read("posts/first/index.html").includes("<a href=\"/\" aria-current=\"true\">"))
  })

  it("runs the config's tags, transforms and hooks", () => {
    assert.ok(read("index.html").includes("<strong>HELLO</strong>"))
    assert.ok(read("index.html").includes("<body data-transformed>"))
    assert.deepEqual(JSON.parse(read("after.json")), { pages: 8, dev: false })
  })

  it("fills pages from the data folder, JSON and JS alike", () => {
    const page = read("projects/index.html")
    assert.ok(page.includes("<li><a href=\"/projects/hexclock/\">Hex Clock</a></li><li><a href=\"/projects/alex_spin/\">Alex Spin</a></li>"))
    assert.ok(page.includes("<footer>2026</footer>"))
    assert.ok(page.includes("Everything Example made"))
    assert.ok(!fs.existsSync(path.join(OUT, "data")), "the data folder isn't copied")
  })

  it("makes a page per item of a list in the data folder", () => {
    const hexclock = read("projects/hexclock/index.html")
    assert.ok(hexclock.includes("<h1>Hex Clock</h1>"))
    assert.ok(hexclock.includes("<a href=\"https://example.com/hexclock\">Try it</a>"))
    assert.ok(hexclock.includes("<title>Hex Clock - Example</title>"))
    assert.ok(!read("projects/alex_spin/index.html").includes("Try it"), "an id that's fine in a URL is kept as it is")
  })

  it("writes the sitemaps, robots.txt and CNAME", () => {
    assert.ok(read("sitemap.xml").includes("<loc>https://example.com/sitemap-posts.xml</loc>"))
    assert.equal(read("sitemap-posts.xml").match(/<url>/g)?.length, 3)
    assert.ok(!read("sitemap-pages.xml").includes("404"))
    assert.equal(read("robots.txt"), [
      "User-agent: BadBot", "Disallow: /", "",
      "User-agent: *", "Allow: /", "Disallow: /private/", "",
      "Sitemap: https://example.com/sitemap.xml", ""
    ].join("\n"))
    assert.equal(read("CNAME"), "example.com\n")
  })
})

describe("site files", () => {
  /** @param {import("../src/config.js").Config} config */
  const logOf = async (config) => {
    const site = { ...resolveConfig(config, ROOT), out: path.join(ROOT, "dist-dev") }
    fs.mkdirSync(site.out, { recursive: true })
    /** @type {string[]} */
    const lines = []
    const log = console.log
    console.log = (line) => lines.push(line)
    try {
      await writeSiteFiles(site, [])
    } finally {
      console.log = log
    }
    return lines.join("\n")
  }

  it("only says it writes what's turned on", async () => {
    assert.match(await logOf({ domain: "example.com", sitemap: { dates: false } }), /Writing the sitemaps\n.*Done, 0 pages in the sitemap$/)
    assert.match(await logOf({ domain: "example.com", cname: true, robots: true }), /Writing CNAME and robots\.txt\n.*Done$/)
    assert.equal(await logOf({ domain: "example.com" }), "")
  })
})

/** @returns {Promise<import("../src/config.js").Site>} The fixture, rendering into a folder of its own */
const devSite = async () => ({ ...await loadConfig(ROOT), out: path.join(ROOT, "dist-dev") })

describe("dev renders", () => {
  /** @type {Record<string, string[]>} */
  let deps = {}

  before(async () => {
    const log = console.log
    console.log = () => {}
    try {
      deps = await renderSite(await devSite())
    } finally {
      console.log = log
    }
  })

  it("knows what each page is made from", () => {
    assert.deepEqual(deps["index.html"].sort(), ["pages/index.data.js", "pages/index.html", "partials/head.html", "partials/nav.html"])
    assert.ok(deps["projects/index.html"].includes("data/projects.json"))
    assert.ok(deps["projects/index.html"].includes("data/site.js"))
    assert.ok(deps["projects/index.html"].includes("js/main.js"), "data/site.js says it's made from it")
    assert.deepEqual(deps["projects/[projects.id].html"].sort(), ["css/site.css", "data/projects.json", "pages/projects/[projects.id].html"])
  })

  it("dates pages by what their data says it's made from", async () => {
    const site = await loadConfig(ROOT)
    const data = await loadData(site)
    assert.deepEqual(data.sources.site, ["js/main.js"])
    const routes = await listRoutes(site, data, new Set(["projects/[projects.id].html"]))
    assert.deepEqual(routes.map(route => route.sources), [["data/projects.json"], ["css/site.css"]], "an item can name its own")
  })

  it("finds the pages a changed file is in", () => {
    assert.deepEqual(pagesUsing(deps, "partials/nav.html").sort(), ["index.html", "posts/[post].html", "posts/index.html"])
    assert.deepEqual(pagesUsing(deps, "data/projects.json").sort(), ["projects/[projects.id].html", "projects/index.html"])
    assert.deepEqual(pagesUsing(deps, "images/logo.png"), [])
  })

  it("renders just the pages asked for", async () => {
    const log = console.log
    console.log = () => {}
    try {
      const only = await renderSite(await devSite(), { only: new Set(["about.html", "projects/index.html"]) })
      assert.deepEqual(Object.keys(only), ["projects/index.html"], "about.html doesn't exist, so it's skipped")
    } finally {
      console.log = log
    }
  })
})
