/*
  The minifier for production builds, run on each page's finished HTML. It takes out comments and the whitespace that
  doesn't show, and has esbuild minify the inline scripts and styles. Nothing else changes: attributes, their quotes
  and every tag stay as they're written, a tag over many lines on one.

  aka. I was stubborn enough to just, make it myself...
*/
import esbuild from "esbuild"

/** Their content is text until their closing tag, not HTML */
const RAW = new Set(["script", "style", "textarea", "title"])

/** Whitespace next to these doesn't show, as they're on lines of their own */
const BLOCK = new Set([
  "html", "head", "body", "address", "article", "aside", "blockquote", "caption", "col", "colgroup", "dd", "details",
  "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hgroup", "hr", "legend", "li", "main", "menu", "nav", "ol", "optgroup", "option", "p", "pre", "section",
  "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"
])

/** Never shown, so whitespace next to them is judged by what's past them */
const HIDDEN = new Set(["base", "link", "meta", "script", "style", "template", "title"])

/** Inline on the outside, but whitespace at the start and end of their content doesn't show, as it starts a line */
const INLINE_BLOCK = new Set(["button", "select"])

/** In an <svg>, only these show their text, the whitespace between its other elements doesn't */
const SVG_TEXT = new Set(["text", "tspan", "textpath", "foreignobject"])

/** Script types that are JavaScript, the rest besides JSON are left as they are */
const JS = new Set(["", "text/javascript", "application/javascript", "module"])
const JSON_TYPES = new Set(["application/json", "application/ld+json", "importmap", "speculationrules"])

/** HTML's whitespace, not \s, which takes &nbsp;'s character too */
const SPACE = /[ \t\n\r\f]+/g
const ONLY_SPACE = /^[ \t\n\r\f]*$/

/**
 * @param {string | undefined} char
 * @returns {boolean} One of HTML's whitespace
 */
const isSpace = (char) => char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f"

// Made once and read from where lastIndex is put, a literal in the loops would be a new one each time round
const TAG_OPEN = /<(\/?)([a-zA-Z][\w:.-]*)/y
const ATTR_NAME = /[^\s"'>/=]+/y
const UNQUOTED = /[^ \t\n\r\f>]*/y
/** Where each raw element's content ends */
const RAW_CLOSE = new Map([...RAW].map(name => [name, new RegExp(`</${name}[ \\t\\n\\r\\f]*>`, "ig")]))

/**
 * @typedef {{ type: "text", text: string }
 *   | { type: "tag", name: string, close: boolean, selfClosing?: boolean, html: string, attrs: Record<string, string> }
 *   | { type: "raw", name: string, text: string, attrs: Record<string, string> }} Token
 */

/**
 * @param {string} html
 * @param {number} start Just after the tag's name
 * @returns {{ attrs: string[], values: Record<string, string>, end: number, selfClosing: boolean, unquoted: boolean }}
 *   Its attributes as written, `name="value"`, their values to look up, where the tag ends, after its ">", and whether
 *   its last value has no quotes
 */
function readAttrs(html, start) {
  /** @type {string[]} */
  const attrs = []
  /** @type {Record<string, string>} */
  const values = {}
  let unquoted = false
  let i = start
  while (i < html.length) {
    while (isSpace(html[i])) i++
    if (html[i] === ">") return { attrs, values, end: i + 1, selfClosing: false, unquoted }
    if (html.startsWith("/>", i)) return { attrs, values, end: i + 2, selfClosing: true, unquoted }
    if (html[i] === "/") {
      i++
      continue
    }
    ATTR_NAME.lastIndex = i
    const found = ATTR_NAME.exec(html)?.[0]
    if (!found) throw new Error(`minify: can't read the tag at "${html.slice(start, start + 40)}"`)
    i += found.length
    let after = i
    while (isSpace(html[after])) after++
    if (html[after] !== "=") {
      attrs.push(found)
      values[found.toLowerCase()] = ""
      unquoted = false
      continue
    }
    i = after + 1
    while (isSpace(html[i])) i++
    const quote = html[i]
    let value
    if (quote === "\"" || quote === "'") {
      const close = html.indexOf(quote, i + 1)
      if (close < 0) throw new Error(`minify: an attribute's quote isn't closed at "${html.slice(start, start + 40)}"`)
      value = html.slice(i, close + 1)
      values[found.toLowerCase()] = html.slice(i + 1, close)
      unquoted = false
    } else {
      UNQUOTED.lastIndex = i
      value = UNQUOTED.exec(html)?.[0] ?? ""
      values[found.toLowerCase()] = value
      unquoted = true
    }
    attrs.push(`${found}=${value}`)
    i += value.length
  }
  throw new Error(`minify: a tag isn't closed at "${html.slice(start, start + 40)}"`)
}

/**
 * @param {string} html
 * @returns {Token[]} Without its comments, text next to text as one
 */
function tokenize(html) {
  /** @type {Token[]} */
  const tokens = []
  /** @param {string} text */
  const text = (text) => {
    const last = tokens.at(-1)
    if (last?.type === "text") last.text += text
    else if (text) tokens.push({ type: "text", text })
  }

  let i = 0
  while (i < html.length) {
    const lt = html.indexOf("<", i)
    if (lt < 0) {
      text(html.slice(i))
      break
    }
    text(html.slice(i, lt))

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4)
      i = end < 0 ? html.length : end + 3
      continue
    }
    // In an <svg> or <math>, text as it is, a > in it included
    if (html.startsWith("<![CDATA[", lt)) {
      const end = html.indexOf("]]>", lt)
      const stop = end < 0 ? html.length : end + 3
      tokens.push({ type: "raw", name: "cdata", text: html.slice(lt, stop), attrs: {} })
      i = stop
      continue
    }
    // <!doctype html>, as it is but on one line
    if (html[lt + 1] === "!") {
      const end = html.indexOf(">", lt)
      const doctype = html.slice(lt, end < 0 ? html.length : end + 1).replace(SPACE, " ")
      tokens.push({ type: "tag", name: "!doctype", close: false, html: doctype, attrs: {} })
      i = end < 0 ? html.length : end + 1
      continue
    }
    TAG_OPEN.lastIndex = lt
    const tag = TAG_OPEN.exec(html)
    // A < that starts no tag is text: a < b
    if (!tag) {
      text("<")
      i = lt + 1
      continue
    }

    const [whole, slash, written] = tag
    const name = written.toLowerCase()
    const { attrs, values, end, selfClosing, unquoted } = readAttrs(html, lt + whole.length)
    // A value without quotes would take a / right after it as its own, <a href=/x/ />
    const ending = selfClosing ? (unquoted ? " />" : "/>") : ">"
    tokens.push({ type: "tag", name, close: Boolean(slash), selfClosing, html: `<${slash}${written}${attrs.map(attr => ` ${attr}`).join("")}${ending}`, attrs: values })
    i = end

    if (!slash && !selfClosing && RAW.has(name)) {
      const closing = /** @type {RegExp} */ (RAW_CLOSE.get(name))
      closing.lastIndex = i
      const found = closing.exec(html)
      const stop = found ? found.index : html.length
      tokens.push({ type: "raw", name, text: html.slice(i, stop), attrs: values })
      if (found) tokens.push({ type: "tag", name, close: true, html: `</${written}>`, attrs: {} })
      i = found ? stop + found[0].length : html.length
    }
  }
  return tokens
}

/** @type {Map<string, Promise<import("esbuild").TransformResult>>} */
const transforms = new Map()

/**
 * esbuild's transform, once per code: every page has the same few inline scripts and styles, from its partials.
 * @param {string} code
 * @param {import("esbuild").TransformOptions} options
 * @returns {Promise<import("esbuild").TransformResult>}
 */
function transform(code, options) {
  const key = `${JSON.stringify(options)}\0${code}`
  let result = transforms.get(key)
  if (!result) {
    result = esbuild.transform(code, options)
    transforms.set(key, result)
  }
  return result
}

/**
 * @param {Token & { type: "raw" }} token
 * @returns {Promise<string>} The script or style minified, when it's one esbuild or JSON can take
 */
async function minifyRaw(token) {
  const text = token.text
  if (token.name === "title") return text.replace(SPACE, " ").replace(/^ | $/g, "")
  if (!text.trim() || token.name === "textarea" || token.name === "cdata") return text

  if (token.name === "style") {
    const { code } = await transform(text, { loader: "css", minify: true })
    return code.trim()
  }
  const type = (token.attrs.type ?? "").trim().toLowerCase()
  if (JSON_TYPES.has(type)) {
    // < escaped as its code point, the same in JSON, so a </script> in a string can't end the script
    return JSON.stringify(JSON.parse(text)).replace(/</g, "\\u003c")
  }
  if (JS.has(type)) {
    const { code } = await transform(text, { loader: "js", minify: true, ...type === "module" && { format: "esm" } })
    return code.trim()
  }
  return text
}

/**
 * @param {Token} token
 * @returns {boolean} Never shown: a hidden element, or whitespace
 */
const isHidden = (token) => token.type === "text" ? ONLY_SPACE.test(token.text) : HIDDEN.has(token.name)

/**
 * @param {Token[]} tokens
 * @param {number} i A text's
 * @returns {boolean} Only hidden elements are between the text and the end of its line, so whitespace at its end
 *   doesn't show. The page's end counts
 */
function endsLine(tokens, i) {
  for (let j = i + 1; j < tokens.length; j++) {
    const token = tokens[j]
    if (isHidden(token)) continue
    return token.type === "tag" && (BLOCK.has(token.name) || (INLINE_BLOCK.has(token.name) && token.close))
  }
  return true
}

/**
 * @param {string} html A page's finished HTML
 * @returns {Promise<string>} Minified
 */
export async function minifyHtml(html) {
  const tokens = tokenize(html)
  let out = ""
  let pre = 0
  let svg = 0
  let svgText = 0
  // At the start of a line, or after a space with only hidden elements since: a space here wouldn't show. Any other tag
  // ends it, as even an empty <span></span> can show an icon by its CSS
  let afterSpace = true
  for (const [i, token] of tokens.entries()) {
    if (token.type === "tag") {
      const step = token.selfClosing ? 0 : token.close ? -1 : 1
      if (token.name === "pre") pre += step
      if (token.name === "svg") svg += step
      if (SVG_TEXT.has(token.name)) svgText += step
      if (BLOCK.has(token.name) || token.name === "!doctype" || token.name === "br") afterSpace = true
      else if (INLINE_BLOCK.has(token.name)) afterSpace = !token.close
      else if (!HIDDEN.has(token.name)) afterSpace = false
      out += token.html
    } else if (token.type === "raw") {
      if (!HIDDEN.has(token.name)) afterSpace = false
      out += await minifyRaw(token)
    } else if (pre > 0) {
      afterSpace = false
      out += token.text
    } else {
      let text = token.text.replace(SPACE, " ")
      if (svg > 0 && svgText === 0) {
        if (text === " ") text = ""
      } else {
        // Only the space collapsed to, trimStart() would take an &nbsp; written as its character too
        if (afterSpace) text = text.replace(/^ /, "")
        if (endsLine(tokens, i)) text = text.replace(/ $/, "")
        if (text) afterSpace = text.endsWith(" ")
      }
      out += text
    }
  }
  return out
}
