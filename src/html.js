/*
  HTML helpers for a site's .data.js files, also what the builder escapes with.
  html`...` escapes what goes into it, unless it's HTML already: another html`...`, raw(), or a list of those.
*/

/** HTML that's safe to put in as-is. */
export class Html {
  /** @param {string} value */
  constructor(value) {
    this.value = value
  }

  toString() {
    return this.value
  }
}

/** @type {Record<string, string>} */
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }

/**
 * @param {string} text
 * @returns {string}
 */
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c])

const CHARACTERS = Object.fromEntries(Object.entries(ENTITIES).map(([c, entity]) => [entity, c]))

/**
 * @param {string} html What escapeHtml made
 * @returns {string} The text back
 */
export const unescapeHtml = (html) => html.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => CHARACTERS[entity])

/**
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
 * @param {TemplateStringsArray} strings
 * @param {...any} values
 * @returns {Html}
 */
export const html = (strings, ...values) => raw(strings.reduce((out, string, i) => out + toHtml(values[i - 1]) + string))
