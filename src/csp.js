import crypto from "crypto"

/**
 * Adds a Content-Security-Policy <meta>, for hosts like GitHub Pages that can't send headers. The inline scripts are
 * allowed by their hash, so it has to run on the finished HTML, after minifying changes them.
 * @param {Record<string, string>} directives
 * @param {string} html The finished page
 * @returns {string}
 */
export function withCsp(directives, html) {
  const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
    // JSON-LD is data, it never runs
    .filter(([, attrs]) => !attrs.includes("application/ld+json"))
    // Over the text as the browser reads it, which turns every line break into a \n
    .map(([, , code]) => `'sha256-${crypto.createHash("sha256").update(code.replace(/\r\n?/g, "\n")).digest("base64")}'`)

  const policy = Object.entries(directives)
    .map(([name, value]) => name === "script-src" && hashes.length ? `${name} ${value} ${[...new Set(hashes)].join(" ")}` : `${name} ${value}`)
    .join("; ")
  return html.replace(/<meta charset[^>]*>/, (charset) => `${charset}<meta http-equiv="Content-Security-Policy" content="${policy}">`)
}
