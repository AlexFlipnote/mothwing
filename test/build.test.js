import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { after, before, describe, it } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import esbuild from "esbuild"
import { loadData } from "../src/data.js"
import { pagesUsing } from "../src/deps.js"
import { minifyHtml } from "../src/minify.js"
import { listRoutes } from "../src/routes.js"
import { serve } from "../src/serve.js"
import { plural } from "../src/log.js"
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

describe("no config", () => {
  it("resolveConfig with no config sets domain and url to null", () => {
    const site = resolveConfig(null, ROOT)
    assert.equal(site.domain, null)
    assert.equal(site.url, null)
  })

  it("builds a plain HTML page with no config file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mothwing-noconfig-"))
    try {
      fs.mkdirSync(path.join(dir, "src/pages"), { recursive: true })
      fs.writeFileSync(path.join(dir, "src/pages/index.html"), "<!doctype html><html><body><h1>Hello</h1></body></html>")
      const site = { ...resolveConfig(null, dir), out: path.join(dir, "dist") }
      await quietBuild(site)
      assert.ok(fs.existsSync(path.join(dir, "dist/index.html")))
      assert.ok(fs.readFileSync(path.join(dir, "dist/index.html"), "utf8").includes("<h1>Hello</h1>"))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("warns once at the end of a production build when x-seo is used without a domain", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mothwing-noseo-"))
    try {
      fs.mkdirSync(path.join(dir, "src/pages"), { recursive: true })
      fs.writeFileSync(path.join(dir, "src/pages/index.html"), "<!doctype html><html><head><x-seo title=\"Hi\" description=\"Test\"/></head><body></body></html>")
      const site = { ...resolveConfig(null, dir), out: path.join(dir, "dist") }
      /** @type {string[]} */
      const logs = []
      const log = console.log
      console.log = (msg) => logs.push(msg)
      try {
        await build(site)
      } finally {
        console.log = log
      }
      assert.equal(logs.filter(l => l.includes("without a domain")).length, 1)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("does not warn during dev renders", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mothwing-noseo-dev-"))
    try {
      fs.mkdirSync(path.join(dir, "src/pages"), { recursive: true })
      fs.writeFileSync(path.join(dir, "src/pages/index.html"), "<!doctype html><html><head><x-seo title=\"Hi\" description=\"Test\"/></head><body></body></html>")
      const site = { ...resolveConfig(null, dir), out: path.join(dir, "dist") }
      fs.mkdirSync(site.out, { recursive: true })
      /** @type {string[]} */
      const logs = []
      const log = console.log
      console.log = (msg) => logs.push(msg)
      try {
        await renderSite(site)
      } finally {
        console.log = log
      }
      assert.ok(!logs.some(l => l.includes("without a domain")))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("throws on sitemap or cname without a domain", () => {
    assert.throws(() => resolveConfig({ sitemap: true }, ROOT), /sitemap needs a domain/)
    assert.throws(() => resolveConfig({ cname: true }, ROOT), /cname needs a domain/)
  })

  it("builds fine with other options set but no domain", () => {
    assert.doesNotThrow(() => resolveConfig({ minify: true, activeLinks: true }, ROOT))
  })

  it("loads a config file that has no domain", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mothwing-nodomain-"))
    try {
      fs.writeFileSync(path.join(dir, "mothwing.config.js"), "export default { minify: true }")
      const site = await loadConfig(dir)
      assert.equal(site.domain, null)
      assert.equal(site.url, null)
      assert.equal(site.minify, true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("writes robots.txt without a Sitemap line when there is no domain", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mothwing-robots-"))
    try {
      fs.mkdirSync(path.join(dir, "src/pages"), { recursive: true })
      fs.writeFileSync(path.join(dir, "src/pages/index.html"), "<!doctype html><html><body></body></html>")
      const site = { ...resolveConfig({ robots: true }, dir), out: path.join(dir, "dist") }
      await quietBuild(site)
      const robots = fs.readFileSync(path.join(dir, "dist/robots.txt"), "utf8")
      assert.ok(robots.includes("User-agent: *"))
      assert.ok(!robots.includes("Sitemap:"))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("fails the build when the config file has a syntax error", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mothwing-broken-"))
    try {
      fs.writeFileSync(path.join(dir, "mothwing.config.js"), "this is not valid javascript }{")
      await assert.rejects(loadConfig(dir))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

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

  it("writes the data's asset()s, which pages link to by a hash of their content", () => {
    const hash = (/** @type {string} */ content) => crypto.createHash("md5").update(content).digest("hex").slice(0, 8)
    assert.equal(read("search.json"), "[\"first\",\"second\"]", "from the data folder")
    assert.ok(read("posts/index.html").includes(`<input type="search" data-index="/search.json?v=${hash("[\"first\",\"second\"]")}">`))
    assert.equal(read("posts/first.txt"), "One\nTwo", "from a page's .data.js")
    assert.ok(read("posts/first/index.html").includes(`<a href="/posts/first.txt?v=${hash("One\nTwo")}">As text</a>`))
  })

  it("minifies to HTML that minifying again leaves as it is", async () => {
    const pages = fs.readdirSync(OUT, { recursive: true }).map(String).filter(file => file.endsWith(".html"))
    assert.ok(pages.length > 5)
    for (const file of pages) assert.equal(await minifyHtml(read(file)), read(file), file)
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
    assert.match(await logOf({ domain: "example.com", sitemap: { dates: false } }), /Writing the sitemap\n.*Done, 0 pages in the sitemap$/)
    assert.match(await logOf({ domain: "example.com", sitemap: { sections: ["posts"], dates: false } }), /Writing the sitemaps\n/)
    assert.match(await logOf({ domain: "example.com", cname: true, robots: true }), /Writing CNAME and robots\.txt\n.*Done$/)
    assert.equal(await logOf({ domain: "example.com" }), "")
  })

  it("writes one sitemap without sections, and an index with them", async () => {
    /** @param {string} url */
    const route = (url) => ({ source: "x.html", output: "x/index.html", url, props: {}, sources: [] })
    const routes = [route("/"), route("/about/"), route("/posts/first/")]
    /** @param {import("../src/config.js").Config} config */
    const write = async (config) => {
      const site = { ...resolveConfig(config, ROOT), out: path.join(ROOT, "dist-dev", "sitemaps") }
      fs.rmSync(site.out, { recursive: true, force: true })
      fs.mkdirSync(site.out, { recursive: true })
      const log = console.log
      console.log = () => {}
      try {
        await writeSiteFiles(site, routes, false)
      } finally {
        console.log = log
      }
      return fs.readdirSync(site.out).sort()
    }

    assert.deepEqual(await write({ domain: "example.com", sitemap: true }), ["sitemap.xml"])
    const single = fs.readFileSync(path.join(ROOT, "dist-dev", "sitemaps", "sitemap.xml"), "utf8")
    assert.ok(single.includes("<urlset") && single.includes("<loc>https://example.com/posts/first/</loc>"))

    assert.deepEqual(await write({ domain: "example.com", sitemap: { sections: ["posts"] } }), ["sitemap-pages.xml", "sitemap-posts.xml", "sitemap.xml"])
    assert.ok(fs.readFileSync(path.join(ROOT, "dist-dev", "sitemaps", "sitemap.xml"), "utf8").includes("<sitemapindex"))
  })

  it("warns that a shallow clone dates pages wrong", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mothwing-shallow-"))
    try {
      const repo = path.join(dir, "repo")
      const clone = path.join(dir, "clone")
      /** @param {string[]} args */
      const git = (args) => execFileSync("git", ["-c", "user.name=moth", "-c", "user.email=moth@example.com", ...args], { cwd: dir, stdio: "ignore" })
      fs.mkdirSync(path.join(repo, "src", "pages"), { recursive: true })
      git(["init", "-q", repo])
      for (const text of ["one", "two"]) {
        fs.writeFileSync(path.join(repo, "src", "pages", "index.html"), text)
        git(["-C", repo, "add", "."])
        git(["-C", repo, "commit", "-q", "-m", text])
      }
      // A file:// URL, as git ignores --depth for a plain path
      git(["clone", "-q", "--depth", "1", pathToFileURL(repo).href, clone])

      const site = { ...resolveConfig({ domain: "example.com", sitemap: true }, clone), out: path.join(dir, "dist") }
      fs.mkdirSync(site.out)
      /** @type {string[]} */
      const lines = []
      const log = console.log
      console.log = (line) => lines.push(line)
      try {
        await writeSiteFiles(site, [{ source: "pages/index.html", output: "index.html", url: "/", props: {}, sources: ["pages/index.html"] }])
      } finally {
        console.log = log
      }
      assert.match(lines.join("\n"), /git clone is shallow/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
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
      deps = (await renderSite(await devSite())).deps
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
      assert.deepEqual(Object.keys(only.deps), ["projects/index.html"], "about.html doesn't exist, so it's skipped")
      assert.equal(only.written, 0, "rendered the same as before, so nothing is written")
    } finally {
      console.log = log
    }
  })
})

describe("dev server", () => {
  /** @type {import("esbuild").BuildContext} */
  let context
  /** @type {Awaited<ReturnType<typeof serve>>} */
  let served
  let url = ""

  before(async () => {
    const site = await devSite()
    const log = console.log
    console.log = () => {}
    try {
      await renderSite(site)
    } finally {
      console.log = log
    }
    fs.mkdirSync(path.join(site.out, "no-page"), { recursive: true })
    context = await esbuild.context({})
    served = await serve(site, context, { host: "127.0.0.1", port: 0 })
    url = `http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (served.server.address()).port}`
  })

  after(async () => {
    served.server.closeAllConnections()
    served.server.close()
    await context.dispose()
  })

  /** @param {string} page */
  const open = (page) => fetch(url + page, { headers: { accept: "text/html" } })

  it("puts the reload script in every page", async () => {
    const res = await open("/")
    assert.equal(res.status, 200)
    assert.match(await res.text(), /<script src="\/__mothwing\/reload.js"><\/script>\n<\/body>/)
  })

  it("answers what isn't there with the 404 page", async () => {
    for (const page of ["/nope/", "/no-page/"]) {
      const res = await open(page)
      assert.equal(res.status, 404, page)
      assert.match(await res.text(), /<title>Not found/, page)
    }
    const image = await fetch(`${url}/nope.png`)
    assert.deepEqual([image.status, await image.text()], [404, "404 - Not Found"], "only pages get the 404 page")
  })

  it("sends the pages open a reload", async () => {
    const req = http.request(`${url}/__mothwing/reload`, {
      headers: { connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" }
    })
    /** @type {import("node:stream").Duplex} */
    const socket = await new Promise(resolve => req.on("upgrade", (_, socket) => resolve(socket)).end())
    const frame = new Promise(resolve => socket.once("data", resolve))
    served.reload()
    assert.equal((await frame).subarray(2).toString(), "reload")
    socket.destroy()
  })
})

describe("routes", () => {
  /** @type {string[]} */
  const dirs = []
  after(() => dirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })))

  /**
   * @param {Record<string, string>} pages Files of a site's pages folder, by their path in it
   * @returns {Promise<import("../src/routes.js").Route[]>}
   */
  async function routesOf(pages) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mothwing-routes-"))
    dirs.push(dir)
    for (const [file, text] of Object.entries(pages)) {
      fs.mkdirSync(path.dirname(path.join(dir, "src/pages", file)), { recursive: true })
      fs.writeFileSync(path.join(dir, "src/pages", file), text)
    }
    const site = resolveConfig({ domain: "example.com" }, dir)
    return listRoutes(site, { values: {}, files: {}, sources: {} })
  }

  it("needs every page to have a slug", async () => {
    for (const item of ["{ n: 1 }", "{ slug: \"\", n: 1 }"]) {
      await assert.rejects(routesOf({
        "posts/[page].html": "<p>{{ n }}</p>",
        "posts/[page].data.js": `export default () => [${item}]`
      }), /pages\/posts\/\[page\]\.data\.js: page 0 has no slug/)
    }
  })

  it("needs a slug that's safe in a URL", async () => {
    for (const bad of ["Hello World", "a?b", "../../x", ".."]) {
      await assert.rejects(routesOf({
        "posts/[page].html": "<p>{{ n }}</p>",
        "posts/[page].data.js": `export default () => [{ slug: ${JSON.stringify(bad)}, n: 1 }]`
      }), /page 0's slug .+ isn't safe in a URL/)
    }
  })

  it("won't write two pages to the same place", async () => {
    await assert.rejects(routesOf({
      "posts/about.html": "<p>About</p>",
      "posts/[page].html": "<p>{{ n }}</p>",
      "posts/[page].data.js": "export default () => [{ slug: \"about\", n: 1 }]"
    }), /makes posts\/about\/index\.html, which pages\/posts\/[\w[\].]+\.html makes too/)
  })
})

describe("examples", () => {
  const examples = path.join(ROOT, "../../examples")
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "mothwing-examples-"))
  after(() => fs.rmSync(out, { recursive: true, force: true }))

  for (const name of fs.readdirSync(examples).filter(name => fs.statSync(path.join(examples, name)).isDirectory())) {
    it(`builds ${name}, with every tag and placeholder filled`, async () => {
      const site = await loadConfig(path.join(examples, name))
      await quietBuild({ ...site, out: path.join(out, name) })
      const pages = fs.readdirSync(path.join(out, name), { recursive: true }).map(String).filter(file => file.endsWith(".html"))
      assert.ok(pages.includes("index.html"))
      for (const page of pages) assert.doesNotMatch(fs.readFileSync(path.join(out, name, page), "utf8"), /\{\{|<\/?x-/, page)
    })
  }
})

/**
 * Builds a site of its own, made of these files in src.
 * @param {Record<string, string>} files
 * @param {import("../src/config.js").Config} [config]
 * @returns {Promise<string[]>} What it logged
 */
async function buildFiles(files, config = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mothwing-links-"))
  /** @type {string[]} */
  const logs = []
  const log = console.log
  console.log = (msg) => logs.push(msg)
  try {
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, "src", file)), { recursive: true })
      fs.writeFileSync(path.join(dir, "src", file), content)
    }
    await build({ ...resolveConfig(config, dir), out: path.join(dir, "dist") })
    return logs
  } finally {
    console.log = log
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe("links", () => {
  it("passes links to pages and files the build has, however they're written", async () => {
    await buildFiles({
      "pages/index.html": [
        "<a href=\"/about/\">a</a> <a href=\"/about\">b</a> <a href=\"about/\">c</a> <a href='/about/?tab=1#top'>d</a>",
        "<a href=\"#top\">e</a> <img src=\"/images/a%20b.png\"> <a href=\"https://example.com/nope\">f</a>",
        "<a href=\"//cdn.example.com/x.js\">g</a> <a href=\"mailto:me@example.com\">h</a>"
      ].join("\n"),
      "pages/about.html": "<a href=\"../\">home</a>",
      "images/a b.png": ""
    })
  })

  it("fails the build on a link to nothing, naming the page", async () => {
    await assert.rejects(buildFiles({
      "pages/index.html": "<a href=\"/gone/\">x</a> <img src=\"/missing.png\">",
      "pages/blog/post.html": "<a href=\"../../gone/\">x</a>"
    }), (/** @type {Error} */ error) => {
      assert.match(error.message, /^2 links to nothing in the build:/)
      assert.match(error.message, /\/gone\/ on pages\/index\.html and 1 more/)
      assert.match(error.message, /\/missing\.png on pages\/index\.html/)
      return true
    })
  })

  it("leaves out links in scripts, comments and text", async () => {
    await buildFiles({
      "pages/index.html": [
        "<script>el.innerHTML = '<a href=\"/gone/\">x</a>'</script>",
        "<!-- <a href=\"/gone/\"> -->",
        "<code>&lt;a href=\"/gone/\"&gt;</code>"
      ].join("\n")
    })
  })

  it("counts files the after hooks write", async () => {
    await buildFiles({ "pages/index.html": "<img src=\"/og/index.png\">" }, {
      after: [({ site }) => {
        fs.mkdirSync(path.join(site.out, "og"), { recursive: true })
        fs.writeFileSync(path.join(site.out, "og/index.png"), "")
      }]
    })
  })

  it("warns about partials no page uses", async () => {
    const logs = await buildFiles({
      "pages/index.html": "<x-html src=\"partials/nav.html\"/>",
      "partials/nav.html": "<x-html src=\"partials/inner/link.html\"/>",
      "partials/inner/link.html": "<a href=\"/\">home</a>",
      "partials/old.html": "<p>old</p>"
    })
    assert.equal(logs.filter(l => l.includes("not used by any page")).length, 1)
    assert.ok(logs.some(l => l.includes("1 partial not used by any page: partials/old.html")))
  })
})

describe("plural", () => {
  it("counts one, none and many", () => {
    assert.equal(plural(1, "page"), "1 page")
    assert.equal(plural(0, "page"), "0 pages")
    assert.equal(plural(2, "page"), "2 pages")
  })
})
