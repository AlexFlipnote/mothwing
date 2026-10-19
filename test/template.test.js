import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveConfig } from "../src/config.js"
import { withCsp } from "../src/csp.js"
import { asset, html } from "../src/html.js"
import { buildState, renderPage } from "../src/render.js"
import { fitDescription, seoTags } from "../src/seo.js"
import { fillPlaceholders, includeHtml, parseTemplate, renderNodes } from "../src/template.js"

describe("fillPlaceholders", () => {
  it("indents every line of a {{{ }}} on a line of its own", () => {
    assert.equal(fillPlaceholders("<ul>\n  {{{ items }}}\n</ul>", { items: "<li>a</li>\n<li>b</li>" }, "x"), "<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>")
  })

  it("leaves the lines inside a <pre> or <textarea> as they are", () => {
    const code = "<p>a</p>\n<pre><code>if (x) {\n  y()\n}</code></pre>\n<textarea>\n  b</textarea>\n<p>c</p>"
    assert.equal(fillPlaceholders("<main>\n  {{{ code }}}\n</main>", { code }, "x"), "<main>\n  <p>a</p>\n  <pre><code>if (x) {\n  y()\n}</code></pre>\n  <textarea>\n  b</textarea>\n  <p>c</p>\n</main>")
  })

  it("never fills what it filled in", () => {
    assert.equal(fillPlaceholders("{{{ a }}}", { a: "{{ b }}" }, "x"), "{{ b }}")
  })

  it("leaves out an attribute that's false or null, and makes true a bare one", () => {
    const html = "<option value=\"{{ v }}\" selected=\"{{ on }}\" hidden=\"{{ off }}\" data-x=\"{{ none }}\" title=\"Lv.{{ v }}\">"
    assert.equal(fillPlaceholders(html, { v: "a&b", on: true, off: false, none: null }, "x"), "<option value=\"a&amp;b\" selected title=\"Lv.a&amp;b\">")
    assert.equal(fillPlaceholders("<p hidden=\"{{ h }}\">", { h: 0 }, "x"), "<p hidden=\"0\">", "only false and null leave it out")
    assert.throws(() => fillPlaceholders("<p hidden=\"{{ missing }}\">", {}, "page.html"), /nothing to fill \{\{ missing \}\}/)
  })

  it("fails on a placeholder with nothing to fill it", () => {
    assert.throws(() => fillPlaceholders("{{ missing }}", {}, "page.html"), /page\.html: nothing to fill \{\{ missing \}\}/)
  })
})

describe("loops and conditions", () => {
  /**
   * @param {string} html
   * @param {Record<string, any>} values
   */
  const run = (html, values) => {
    const used = new Set()
    return { html: renderNodes(parseTemplate(html, "page.html"), values, { from: "page.html", used }), used }
  }
  const projects = [{ name: "Hexclock", url: "/hexclock/" }, { name: "Tom & Jerry" }]

  it("repeats a block per item, leaving no empty lines and the indent it would have by hand", () => {
    const html = "<ul>\n  <x-each items=\"projects\" as=\"project\">\n    <li>{{ project.name }}</li>\n  </x-each>\n</ul>"
    assert.equal(run(html, { projects }).html, "<ul>\n  <li>Hexclock</li>\n  <li>Tom &amp; Jerry</li>\n</ul>")
  })

  it("takes the indent off its own HTML, never off what's filled in", () => {
    const html = "<div>\n  <x-each items=\"blocks\" as=\"b\">\n    <x-if value=\"b\">\n      <pre>{{{ b }}}</pre>\n      {{{ b }}}\n    </x-if>\n  </x-each>\n</div>"
    assert.equal(run(html, { blocks: ["a\n    b"] }).html, "<div>\n  <pre>a\n    b</pre>\n  a\n      b\n</div>")
  })

  it("works inline too", () => {
    assert.equal(run("<p><x-each items=\"n\" as=\"x\" index=\"i\">{{ i }}:{{ x }} </x-each></p>", { n: ["a", "b"] }).html, "<p>0:a 1:b </p>")
  })

  it("nests", () => {
    const html = "<x-each items=\"groups\" as=\"group\">\n<h2>{{ group.name }}</h2>\n<x-each items=\"group.items\" as=\"item\">\n<p>{{ item }}</p>\n</x-each>\n</x-each>\n"
    assert.equal(run(html, { groups: [{ name: "A", items: [1, 2] }, { name: "B", items: [3] }] }).html, "<h2>A</h2>\n<p>1</p>\n<p>2</p>\n<h2>B</h2>\n<p>3</p>\n")
  })

  it("shows a block only when its value is there, or with not= when it isn't", () => {
    const html = "<x-each items=\"projects\" as=\"p\"><x-if value=\"p.url\"><a href=\"{{ p.url }}\">{{ p.name }}</a></x-if><x-if not=\"p.url\">{{ p.name }}</x-if>|</x-each>"
    assert.equal(run(html, { projects }).html, "<a href=\"/hexclock/\">Hexclock</a>|Tom &amp; Jerry|")
    assert.equal(run("<x-if value=\"list\">full</x-if><x-if not=\"list\">empty</x-if>", { list: [] }).html, "empty")
  })

  it("notes the names a page used", () => {
    assert.deepEqual([...run("<x-each items=\"projects\" as=\"p\">{{ p.name }}</x-each>{{ title }}", { projects, title: "x" }).used].sort(), ["p", "projects", "title"])
  })

  it("says what's wrong", () => {
    assert.throws(() => run("<x-each items=\"projects\" as=\"p\">", { projects }), /page\.html: <x-each> is never closed/)
    assert.throws(() => run("<x-if value=\"a\"></x-each>", { a: 1 }), /<\/x-each> where <x-if> should be closed/)
    assert.throws(() => run("<x-each items=\"title\" as=\"t\"></x-each>", { title: "x" }), /<x-each items="title"> isn't a list/)
    assert.throws(() => run("<x-if value=\"projets.url\"></x-if>", { projects }), /<x-if> has nothing called projets/)
    assert.throws(() => run("<x-each items=\"projects\"></x-each>", { projects }), /<x-each> needs items="\.\.\." and as="\.\.\."/)
  })

  it("points out a placeholder where a name goes", () => {
    assert.throws(() => run("<x-each items=\"{{ projects }}\" as=\"p\"></x-each>", { projects }), /<x-each items="\{\{ projects \}\}"> takes the name on its own: items="projects"/)
    assert.throws(() => run("<x-if not=\"{{ p.url }}\"></x-if>", { p: {} }), /<x-if not="\{\{ p\.url \}\}"> takes the name on its own: not="p\.url"/)
    assert.throws(() => run("<x-each items=\"projects\" as=\"{{ p }}\"></x-each>", { projects }), /<x-each as="\{\{ p \}\}"> names what's looped over, a plain name like as="project"/)
  })

  it("reads what Prettier makes of it", () => {
    // Prettier's output for the same loop, with the tags it breaks before their ">"
    const formatted = [
      "<ul>",
      "  <x-each items=\"projects\" as=\"project\">",
      "    <li>",
      "      <x-if value=\"project.url\"",
      "        ><a href=\"{{ project.url }}\">{{ project.name }}</a></x-if",
      "      >",
      "    </li>",
      "  </x-each>",
      "</ul>"
    ].join("\n")
    const { html } = run(formatted, { projects })
    assert.ok(!html.includes("x-if") && !html.includes("x-each"), html)
    assert.equal(html.replace(/\s+/g, " "), "<ul> <li> <a href=\"/hexclock/\">Hexclock</a> </li> <li> </li> </ul>")
  })
})

describe("seoTags", () => {
  it("doesn't add the site's name to a title that is it", () => {
    const site = resolveConfig({ domain: "example.com", seo: { siteName: "Example" } }, process.cwd())
    const route = { source: "index.html", output: "index.html", url: "/", props: {}, sources: [] }
    assert.equal(seoTags(site, route, { title: "Example", description: "d" })[0], "<title>Example</title>")
    assert.equal(seoTags(site, route, { title: "Home", description: "d" })[0], "<title>Home - Example</title>")
  })

  it("escapes the config's text, which isn't HTML like the tag's", () => {
    const image = { src: "/logo.png", width: 512, height: 512, alt: "A \"moth\" as <|>" }
    const site = resolveConfig({ domain: "example.com", seo: { siteName: "Tom & \"Jerry\"", image } }, process.cwd())
    const route = { source: "about.html", output: "about/index.html", url: "/about/", props: {}, sources: [] }
    const tags = seoTags(site, route, { title: "About", description: "d", name: "About" })
    assert.equal(tags[0], "<title>About - Tom &amp; &quot;Jerry&quot;</title>")
    assert.ok(tags.includes("<meta property=\"og:image:alt\" content=\"A &quot;moth&quot; as &lt;|&gt;\">"))
    assert.ok(tags.at(-1)?.includes("\"name\":\"Tom & \\\"Jerry\\\"\""), "the breadcrumbs' JSON has it as text")
  })
})

describe("fitDescription", () => {
  it("cuts long ones at a word", () => {
    const cut = fitDescription("word ".repeat(50), 30)
    assert.ok(cut.length <= 30)
    assert.ok(cut.endsWith("word..."))
  })

  it("leaves short ones as they are", () => {
    assert.equal(fitDescription("Short &amp; sweet", 160), "Short &amp; sweet")
  })
})

describe("withCsp", () => {
  /** @param {string} html */
  const policy = (html) => withCsp({ "script-src": "'self'" }, `<meta charset="utf-8">${html}`).match(/content="([^"]+)"/)?.[1]

  it("hashes inline scripts the same whatever their line endings", () => {
    assert.equal(policy("<script>a\r\nb</script>"), policy("<script>a\nb</script>"))
  })

  it("leaves out JSON-LD and scripts with a src", () => {
    assert.equal(policy("<script type=\"application/ld+json\">{}</script><script src=\"/a.js\"></script>"), "script-src 'self'")
  })
})

describe("renderPage", () => {
  /** @param {string} html */
  const render = (html) => {
    const site = resolveConfig({ domain: "example.com" }, process.cwd())
    const state = buildState()
    state.templates.set("x.html", { nodes: parseTemplate(html, "pages/x.html"), partials: new Set() })
    return renderPage(site, state, { source: "x.html", output: "x/index.html", url: "/x/", props: {}, sources: [] }, false)
  }

  it("fails on a tag it doesn't know", () => {
    assert.throws(() => render("<x-nope/>"), /pages\/x\.html: unknown tag <x-nope>/)
  })

  it("says which attribute a tag is missing", () => {
    assert.throws(() => render("<x-js/>"), /<x-js> needs a src="\.\.\."/)
  })

  it("reads tags Prettier split over lines", () => {
    const formatted = "<x-seo\n  title=\"Home\"\n  description=\"The front page\"\n/>\n<x-css src=\"/css/a.css\" />"
    const html = render(formatted)
    assert.ok(html.includes("<title>Home - example.com</title>"), html)
    assert.ok(html.includes("<link href=\"/css/a.css\" type=\"text/css\" rel=\"stylesheet\">"), html)
  })

  it("takes asset paths with or without the leading slash", () => {
    assert.equal(render("<x-css src=\"css/a.css\"/>"), render("<x-css src=\"/css/a.css\"/>"))
  })
})

describe("asset", () => {
  it("is its URL with a hash of its content, in {{ }} and html`...` alike", () => {
    const index = asset("search.json", "[1,2]")
    assert.equal(index.path, "/search.json")
    assert.match(index.url, /^\/search\.json\?v=[0-9a-f]{8}$/)
    assert.equal(asset("/search.json", "[1,2]").url, index.url, "with or without the leading slash")
    assert.notEqual(asset("search.json", "[1,2,3]").url, index.url, "a new hash for new content")
    assert.equal(fillPlaceholders("<input data-index=\"{{ search.index }}\">", { search: { index } }, "x"), `<input data-index="${index.url}">`)
    assert.equal(String(html`<a href="${index}">`), `<a href="${index.url}">`)
  })

  it("takes bytes too", () => {
    assert.match(asset("images/dot.png", new Uint8Array([137, 80, 78, 71])).url, /^\/images\/dot\.png\?v=[0-9a-f]{8}$/)
  })

  it("stays in the build", () => {
    assert.throws(() => asset("../secret.txt", "x"), /has to stay in the build/)
  })
})

describe("includeHtml", () => {
  it("says what's wrong with a partial", () => {
    assert.throws(() => includeHtml(process.cwd(), "<x-html str=\"a.html\"/>", "page.html"), /page\.html: <x-html> needs a src="\.\.\."/)
    assert.throws(() => includeHtml(process.cwd(), "<x-html src=\"missing.html\"/>", "page.html"), /page\.html: <x-html> can't find missing\.html/)
  })
})

describe("resolveConfig", () => {
  it("fails on an option it doesn't know", () => {
    // @ts-expect-error the typo is the test
    assert.throws(() => resolveConfig({ domain: "example.com", cnmae: true }, process.cwd()), /unknown option "cnmae"/)
  })

  it("keeps the extras off until asked for", () => {
    const site = resolveConfig({ domain: "example.com" }, process.cwd())
    assert.deepEqual([site.minify, site.csp, site.sitemap, site.robots, site.cname, site.activeLinks], [false, false, false, false, false, false])
  })

  it("puts the chunks next to the modules", () => {
    assert.equal(resolveConfig({ domain: "example.com", js: { modules: ["js/a.js"] } }, process.cwd()).js.chunks, "js/chunks")
  })

  it("leaves a renamed partials folder out of the build", () => {
    const site = resolveConfig({ domain: "example.com", partials: "components" }, process.cwd())
    assert.deepEqual(site.exclude, ["pages", "components", "data"])
  })
})
