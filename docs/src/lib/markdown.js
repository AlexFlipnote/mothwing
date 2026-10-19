/*
  The README and examples/ as HTML, by marked. Code blocks are highlighted by highlight.js into classes, which
  docs.scss colours, as the CSP allows no inline styles. Headings get the ids GitHub gives them, so a link to one works
  on both. Links to mothwing.dev become the site's own, and to another example its page.
*/
import { Marked } from "marked"
import { markedHighlight } from "marked-highlight"
import { gfmHeadingId } from "marked-gfm-heading-id"
import hljs from "highlight.js/lib/core"
import bash from "highlight.js/lib/languages/bash"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import xml from "highlight.js/lib/languages/xml"

hljs.registerLanguage("bash", bash)
hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("json", json)
hljs.registerLanguage("xml", xml)

/**
 * @param {string} href
 * @returns {string} Where it goes on the site
 */
const link = (href) => href
  .replace(/^https:\/\/mothwing\.dev\//, "/")
  .replace(/^([\w-]+)\.md(#.*)?$/, "/examples/$1/$2")

const marked = new Marked(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    // sh, js and html are aliases of these. A block without a language, like a folder tree, is left as it is
    highlight: (code, lang) => hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : code
  }),
  gfmHeadingId(),
  {
    walkTokens: (token) => {
      if (token.type === "link") token.href = link(token.href)
    }
  }
)

/**
 * @param {string} text
 * @returns {string} As HTML
 */
export const markdown = (text) => /** @type {string} */ (marked.parse(text))

/**
 * @param {string} text Markdown inside a block
 * @returns {string} As plain text, for descriptions
 */
export const plain = (text) => text
  .replace(/`([^`]+)`/g, "$1")
  .replace(/\*\*([^*]+)\*\*/g, "$1")
  .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
