import { Marked } from "marked"

const marked = new Marked({
  walkTokens: (token) => {
    if (token.type !== "link") return
    token.href = token.href
      .replace(/^https:\/\/mothwing\.dev\//, "/")
      .replace(/^([\w-]+)\.md(#.*)?$/, "/examples/$1/$2")
  }
})

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
