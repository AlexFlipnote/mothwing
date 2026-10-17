import fs from "fs"
import path from "path"
import { escapeHtml } from "./html.js"
import { posix } from "./log.js"

/**
 * @param {string} attrs ` src="index.js" module`
 * @returns {Record<string, string | true>}
 */
export const parseAttrs = (attrs) => Object.fromEntries([...attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? true]))

/**
 * Pastes in the <x-html src="..."/> partials. One on a line of its own is indented like its tag, so partials are
 * written unindented.
 * @param {string} src The source folder, partials are relative to it
 * @param {string} html
 * @param {string} from For errors, the file `html` came from
 * @param {Set<string>} [used] Gets every partial pasted in, relative to src
 * @param {number} [depth]
 * @returns {string}
 */
export function includeHtml(src, html, from, used = new Set(), depth = 0) {
  if (depth > 10) throw new Error(`${from}: <x-html> nested too deep, is a partial including itself?`)

  return html.replace(/([ \t]*)<x-html((?:\s+[\w-]+(?:="[^"]*")?)*)\s*\/?>/g, (_, space, attrs, offset, page) => {
    const file = parseAttrs(attrs).src
    if (typeof file !== "string") throw new Error(`${from}: <x-html> needs a src="..."`)
    const partial = path.join(src, file.replace(/^\//, ""))
    if (!fs.existsSync(partial)) throw new Error(`${from}: <x-html> can't find ${file}`)
    used.add(posix(path.relative(src, partial)))

    const content = includeHtml(src, fs.readFileSync(partial, "utf8"), file, used, depth + 1).trimEnd()
    const lineStart = offset === 0 || page[offset - 1] === "\n"
    if (!lineStart) return space + content
    return content.split("\n").map(line => line.trim() ? space + line : "").join("\n")
  })
}

/**
 * @param {Record<string, any>} values
 * @param {string} name "project.name"
 * @returns {any} undefined when any part of it is missing
 */
export const lookup = (values, name) => name.split(".").reduce((value, key) => value?.[key], values)

/**
 * What a page is filled from, and what it used of it.
 * @typedef {object} Context
 * @property {string} from The page, for errors
 * @property {Set<string>} used The first part of every name looked up, "projects" for {{ projects.0.name }}
 */

/**
 * @param {Record<string, any>} values
 * @param {string} name
 * @param {Context} context
 * @returns {any}
 */
function find(values, name, context) {
  context.used.add(name.split(".")[0])
  return lookup(values, name)
}

/**
 * {{ name }} is filled with the value as text, {{{ name }}} as HTML, on a line of its own each line indented like it.
 * Names can go into objects: {{ project.name }}. An attribute that's one placeholder and nothing else follows its
 * value: false or null leaves it out, true makes it a bare one, `selected="{{ group.selected }}"` -> `selected`.
 * @param {string} html
 * @param {Record<string, any>} values
 * @param {string} from For errors, the page's file
 * @param {Set<string>} [used] Gets the first part of every name filled in
 * @returns {string}
 */
export function fillPlaceholders(html, values, from, used = new Set()) {
  /** @param {string} name */
  const found = (name) => {
    const value = find(values, name, { from, used })
    if (value === undefined) throw new Error(`${from}: nothing to fill {{ ${name} }} with`)
    return value
  }

  // One pass, so what's filled in is never searched for placeholders itself
  const placeholder = /(\s+)([\w:-]+)="\{\{\s*([\w.]+)\s*\}\}"|^([ \t]*)\{\{\{\s*([\w.]+)\s*\}\}\}[ \t]*$|\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/gm
  return html.replace(placeholder, (_, space, attr, attrValue, indent, line, inline, text) => {
    if (attr) {
      const value = found(attrValue)
      if (value === false || value === null) return ""
      return value === true ? `${space}${attr}` : `${space}${attr}="${escapeHtml(String(value))}"`
    }
    if (line) return String(found(line)).split("\n").map(l => l.trim() ? indent + l : "").join("\n")
    return inline ? String(found(inline)) : escapeHtml(String(found(text)))
  })
}

/**
 * A page's HTML split at its <x-each> and <x-if> blocks.
 * @typedef {{ type: "text", text: string }
 *   | { type: "x-each" | "x-if", attrs: Record<string, string | true>, dedent: number, children: Node[] }} Node
 */

// A block tag on a line of its own takes its line with it, so it leaves no empty line behind. Formatters like
// Prettier can break a tag before its ">", "</x-if\n  >" included
const BLOCK = /^([ \t]*)<(x-each|x-if)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>[ \t]*\r?\n|^[ \t]*<\/(x-each|x-if)\s*>[ \t]*(?:\r?\n|$)|<(x-each|x-if)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>|<\/(x-each|x-if)\s*>/gm

/**
 * @param {string} text
 * @returns {number} The fewest spaces any of its lines start with
 */
const indentOf = (text) => Math.min(...text.split("\n").filter(line => line.trim()).map(line => line.length - line.trimStart().length))

/**
 * @param {string} html
 * @param {string} from For errors, the page's file
 * @returns {Node[]}
 */
export function parseTemplate(html, from) {
  /** @type {{ node: Node & { type: "x-each" | "x-if" }, indent: string | null, bodyStart: number }[]} */
  const open = []
  /** @type {Node[]} */
  const root = []
  const children = () => open.at(-1)?.node.children ?? root
  let last = 0

  for (const match of html.matchAll(BLOCK)) {
    const [whole, lineIndent, lineOpen, lineAttrs, lineClose, inlineOpen, inlineAttrs, inlineClose] = match
    const start = match.index ?? 0
    if (start > last) children().push({ type: "text", text: html.slice(last, start) })
    last = start + whole.length

    const opening = lineOpen ?? inlineOpen
    if (opening) {
      const node = { type: /** @type {"x-each" | "x-if"} */ (opening), attrs: parseAttrs(lineAttrs ?? inlineAttrs ?? ""), dedent: 0, children: [] }
      children().push(node)
      open.push({ node, indent: lineOpen ? lineIndent : null, bodyStart: last })
      continue
    }

    const closing = lineClose ?? inlineClose
    const block = open.pop()
    if (!block) throw new Error(`${from}: </${closing}> without its <${closing}>`)
    if (block.node.type !== closing) throw new Error(`${from}: </${closing}> where <${block.node.type}> should be closed`)
    // A block on lines of its own is indented a step deeper than where its output goes
    if (block.indent !== null) block.node.dedent = Math.max(0, indentOf(html.slice(block.bodyStart, start)) - block.indent.length)
  }

  if (open.length) throw new Error(`${from}: <${open[0].node.type}> is never closed`)
  if (last < html.length) root.push({ type: "text", text: html.slice(last) })
  return root
}

/**
 * @param {string} text
 * @param {number} spaces
 * @returns {string} Every line with up to `spaces` of its indent taken off
 */
const dedent = (text, spaces) => spaces ? text.replace(new RegExp(`^[ \\t]{1,${spaces}}`, "gm"), "") : text

/**
 * @param {any} value
 * @returns {boolean} False for nothing, false, 0, "" and empty lists
 */
const truthy = (value) => Array.isArray(value) ? value.length > 0 : Boolean(value)

/**
 * Fills in the placeholders and runs the blocks:
 * - <x-each items="projects" as="project">...</x-each> once per item, `index="i"` names its position
 * - <x-if value="project.url">...</x-if> only when it's there, `not="..."` only when it isn't
 * @param {Node[]} nodes
 * @param {Record<string, any>} values
 * @param {Context} context
 * @returns {string}
 */
export function renderNodes(nodes, values, context) {
  const { from } = context

  /**
   * @param {string} tag
   * @param {string} attr
   * @param {string} name What the attribute says, a name to look up
   */
  const known = (tag, attr, name) => {
    const bare = name.match(/^\{\{\{?\s*([\w.]+)\s*\}?\}\}$/)?.[1]
    if (bare) throw new Error(`${from}: <${tag} ${attr}="${name}"> takes the name on its own: ${attr}="${bare}"`)
    const value = find(values, name, context)
    if (!(name.split(".")[0] in values)) throw new Error(`${from}: <${tag}> has nothing called ${name.split(".")[0]}`)
    return value
  }

  return nodes.map(node => {
    if (node.type === "text") return fillPlaceholders(node.text, values, from, context.used)

    const { attrs } = node
    if (node.type === "x-each") {
      if (typeof attrs.items !== "string" || typeof attrs.as !== "string") throw new Error(`${from}: <x-each> needs items="..." and as="..."`)
      const items = known("x-each", "items", attrs.items)
      if (!Array.isArray(items)) throw new Error(`${from}: <x-each items="${attrs.items}"> isn't a list`)
      const { as, index } = attrs
      for (const [attr, name] of Object.entries({ as, index })) {
        if (typeof name === "string" && !/^\w+$/.test(name)) throw new Error(`${from}: <x-each ${attr}="${name}"> names what's looped over, a plain name like ${attr}="${attr === "as" ? "project" : "i"}"`)
      }
      return dedent(items.map((item, i) => renderNodes(node.children, {
        ...values,
        [as]: item,
        ...typeof index === "string" && { [index]: i }
      }, context)).join(""), node.dedent)
    }

    const name = attrs.value ?? attrs.not
    if (typeof name !== "string") throw new Error(`${from}: <x-if> needs value="..." or not="..."`)
    const shown = truthy(known("x-if", attrs.value !== undefined ? "value" : "not", name)) === (attrs.value !== undefined)
    return shown ? dedent(renderNodes(node.children, values, context), node.dedent) : ""
  }).join("")
}
