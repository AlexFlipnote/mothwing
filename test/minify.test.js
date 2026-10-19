import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveConfig } from "../src/config.js"
import { minifyHtml } from "../src/minify.js"

describe("minifyHtml", () => {
  it("puts a tag over many lines on one, its attributes as written", async () => {
    const html = "<img\n  src=\"/a.png\"\n  alt='a > b'\n  data-text=\"one\n  two\"\n  hidden\n>"
    assert.equal(await minifyHtml(html), "<img src=\"/a.png\" alt='a > b' data-text=\"one\n  two\" hidden>")
  })

  it("keeps a self-closing tag's /, and a space before it after a value without quotes", async () => {
    assert.equal(await minifyHtml("<svg>\n  <path d=\"M0 0\"\n  />\n</svg>"), "<svg><path d=\"M0 0\"/></svg>")
    assert.equal(await minifyHtml("<a href=/x/ />"), "<a href=/x/ />")
  })

  it("takes out the whitespace next to block tags, and nothing more between inline ones", async () => {
    assert.equal(await minifyHtml("<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>"), "<ul><li>a</li><li>b</li></ul>")
    assert.equal(await minifyHtml("<p>\n  Hello <b>big</b>\n  <i>world</i>\n</p>"), "<p>Hello <b>big</b> <i>world</i></p>")
  })

  it("takes out the whitespace between an <svg>'s elements, but not in its <text>", async () => {
    const html = "<p>A <svg viewBox=\"0 0 9 9\">\n  <g>\n    <line x1=\"0\"/>\n  </g>\n  <text>\n    big  moth\n  </text>\n</svg> b</p>"
    assert.equal(await minifyHtml(html), "<p>A <svg viewBox=\"0 0 9 9\"><g><line x1=\"0\"/></g><text> big moth </text></svg> b</p>")
  })

  it("takes out the whitespace at the start and end of a button's content, not around it", async () => {
    assert.equal(await minifyHtml("<p>Go <button>\n  <svg></svg>\n  Menu\n</button> now</p>"), "<p>Go <button><svg></svg> Menu</button> now</p>")
  })

  it("judges whitespace next to a script by what shows past it", async () => {
    assert.equal(await minifyHtml("<div>\n  <a>x</a>\n  <script>a()</script>\n</div>"), "<div><a>x</a><script>a();</script></div>")
    assert.equal(await minifyHtml("<p><a>x</a>\n<script>a()</script>\n<a>y</a></p>"), "<p><a>x</a> <script>a();</script><a>y</a></p>")
  })

  it("keeps the whitespace next to inline tags, even empty ones, which can show an icon by their CSS", async () => {
    const html = "<p><span class=\"chip\"><span class=\"icon\"></span> Collectable</span>\n  <a href=\"/\">\n    <svg></svg>\n    Home\n  </a>\n</p>"
    assert.equal(await minifyHtml(html), "<p><span class=\"chip\"><span class=\"icon\"></span> Collectable</span> <a href=\"/\"> <svg></svg> Home </a></p>")
  })

  it("takes out a space that starts a line after a <br>", async () => {
    assert.equal(await minifyHtml("<p>A line<br>\n  the next</p>"), "<p>A line<br>the next</p>")
  })

  it("keeps an &nbsp; written as its character", async () => {
    assert.equal(await minifyHtml("<p>\u00a0a\u00a0</p>"), "<p>\u00a0a\u00a0</p>")
  })

  it("leaves <pre> and <textarea> as they are", async () => {
    const html = "<pre><code>if (x) {\n  <b>y</b>()\n}</code></pre>\n<textarea>\n  b  </textarea>"
    assert.equal(await minifyHtml(html), html.replace("</pre>\n", "</pre>"))
  })

  it("takes out comments, but not from inside a script", async () => {
    assert.equal(await minifyHtml("<p>a<!-- note -->b</p>"), "<p>ab</p>")
    assert.equal(await minifyHtml("<script type=\"text/x-template\"><!-- kept --></script>"), "<script type=\"text/x-template\"><!-- kept --></script>")
  })

  it("minifies inline scripts and styles, a script's own names kept for the others on the page", async () => {
    const greet = "\n  function greet(name) {\n    return \"hi \" + name\n  }\n  greet(\"a\")\n"
    assert.equal(await minifyHtml(`<script>${greet}</script>`), "<script>function greet(e){return\"hi \"+e}greet(\"a\");</script>")
    assert.equal(await minifyHtml(`<script type="module">${greet}</script>`), "<script type=\"module\">function n(e){return\"hi \"+e}n(\"a\");</script>")
    assert.equal(await minifyHtml("<style>\n  a { color: #ff0000; }\n</style>"), "<style>a{color:red}</style>")
  })

  it("compacts JSON, with < escaped so a </script> in it can't end the script", async () => {
    const html = "<script type=\"application/ld+json\">{\n  \"name\": \"\\u003c/script>\"\n}</script>"
    assert.equal(await minifyHtml(html), "<script type=\"application/ld+json\">{\"name\":\"\\u003c/script>\"}</script>")
  })

  it("leaves CDATA as it is, a > in it included", async () => {
    const html = "<svg><text><![CDATA[ a  >  b ]]></text></svg>"
    assert.equal(await minifyHtml(html), html)
  })

  it("keeps the whitespace around <noscript>, whose content shows without JS", async () => {
    assert.equal(await minifyHtml("<p><a>x</a>\n<noscript><a>y</a></noscript>\n<a>z</a></p>"), "<p><a>x</a> <noscript><a>y</a></noscript> <a>z</a></p>")
  })

  it("leaves text with a < that starts no tag", async () => {
    assert.equal(await minifyHtml("<p>a < b</p>"), "<p>a < b</p>")
  })

  it("puts the doctype on one line, and the title's text", async () => {
    assert.equal(await minifyHtml("<!doctype\n  html>\n<title>\n  Home\n</title>"), "<!doctype html><title>Home</title>")
  })

  it("fails on a script esbuild can't read", async () => {
    await assert.rejects(minifyHtml("<script>const = </script>"))
  })
})

describe("minify in the config", () => {
  it("is true or false, html-minifier-terser's options fail", () => {
    assert.equal(resolveConfig({ domain: "example.com", minify: true }, process.cwd()).minify, true)
    // @ts-expect-error the options it took until 0.1.0
    assert.throws(() => resolveConfig({ domain: "example.com", minify: { collapseWhitespace: true } }, process.cwd()), /minify is true or false/)
  })
})
