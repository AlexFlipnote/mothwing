import crypto from "crypto"

/**
 * @param {string} html
 * @param {"script" | "style"} tag
 * @returns {string[]} The hash of each inline one, as a CSP source
 */
const inlineHashes = (html, tag) => [...html.matchAll(new RegExp(`<${tag}(?![^>]*\\ssrc=)([^>]*)>([\\s\\S]*?)</${tag}>`, "g"))]
  // JSON-LD is data, it never runs
  .filter(([, attrs]) => !attrs.includes("application/ld+json"))
  // Over the text as the browser reads it, which turns every line break into a \n
  .map(([, , code]) => `'sha256-${crypto.createHash("sha256").update(code.replace(/\r\n?/g, "\n")).digest("base64")}'`)

/**
 * Adds a Content-Security-Policy <meta>, for hosts like GitHub Pages that can't send headers. The inline scripts and
 * styles are allowed by their hash, so it has to run on the finished HTML, after minifying changes them.
 * @param {Record<string, string>} directives
 * @param {string} html The finished page
 * @returns {string}
 */
export function withCsp(directives, html) {
  if (!/<meta charset[^>]*>/i.test(html)) throw new Error("csp: the page needs a <meta charset=\"utf-8\"> for the policy to go after")
  const hashes = { "script-src": inlineHashes(html, "script"), "style-src": inlineHashes(html, "style") }

  const policy = Object.entries(directives)
    .map(([name, value]) => {
      const own = name in hashes ? [...new Set(hashes[/** @type {keyof hashes} */ (name)])] : []
      // A hash turns 'unsafe-inline' off, which the config set for what can't be hashed, like style="..."
      return own.length && !value.includes("'unsafe-inline'") ? `${name} ${value} ${own.join(" ")}` : `${name} ${value}`
    })
    .join("; ")
  return html.replace(/<meta charset[^>]*>/i, (charset) => `${charset}<meta http-equiv="Content-Security-Policy" content="${policy}">`)
}
