/*
  Helpers for a site's .data.js files, also what the builder escapes with.
  html`...` escapes what goes into it, unless it's HTML already: another html`...`, raw(), or a list of those.
  No Node imports, as browser code uses these too, slug() for one.
*/

/** HTML that's safe to put in as-is. */
export class Html {
  /** @param {string} value */
  constructor(value) {
    /** The HTML itself */
    this.value = value
  }

  /** The HTML, so an Html can be put in a string as it is */
  toString() {
    return this.value
  }
}

/** @type {Record<string, string>} */
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }

/**
 * Escapes the characters that mean something in HTML, `&<>"'`, so the text shows as it is.
 * @param {string} text
 * @returns {string}
 */
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c])

const CHARACTERS = Object.fromEntries(Object.entries(ENTITIES).map(([c, entity]) => [entity, c]))

/**
 * Undoes escapeHtml, for text that comes escaped, like the value of an attribute.
 * @param {string} html What escapeHtml made
 * @returns {string} The text back
 */
export const unescapeHtml = (html) => html.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => CHARACTERS[entity])

/**
 * Marks a string as HTML already, for html`...` to put in without escaping. Only for HTML you trust.
 * @param {string} value
 * @returns {Html} Put in as it is, not escaped
 */
export const raw = (value) => new Html(value)

/**
 * @param {any} value
 * @returns {string} null, undefined and false are left out, lists are joined
 */
const toHtml = (value) => {
  if (value == null || value === false) return ""
  if (Array.isArray(value)) return value.map(toHtml).join("")
  return value instanceof Html ? value.value : escapeHtml(value)
}

/**
 * Makes a name safe for a URL, for the slugs of generated pages.
 * @param {string} name
 * @returns {string} The name as a URL part: "Rak'tika Greatwood" -> "raktika-greatwood"
 */
export const slug = (name) => name
  .normalize("NFD")
  .replace(/[̀-ͯ'’*]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")

/**
 * A template tag for HTML in .data.js files. What goes into it is escaped, unless it's Html already: another
 * html`...`, raw(), or a list of those. null, undefined and false are left out.
 * @param {TemplateStringsArray} strings
 * @param {...any} values
 * @returns {Html}
 */
export const html = (strings, ...values) => raw(strings.reduce((out, string, i) => out + toHtml(values[i - 1]) + string))
