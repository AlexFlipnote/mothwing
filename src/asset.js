/*
  asset() makes a file for the build, which a page links to by its value: {{ search.index }} -> /search.json?v=hash.
  Node only, it hashes with crypto, so it's in "mothwing" and not in "mothwing/html", which runs in browsers too.
*/
import crypto from "crypto"

/** A file the build writes, made by asset(). As text, it's the URL to link to it by. */
export class Asset {
  /**
   * @param {string} file Where it goes in the build: "search.json"
   * @param {string | Uint8Array} content
   */
  constructor(file, content) {
    const normalized = `/${file}`.replace(/\\/g, "/").replace(/\/{2,}/g, "/")
    if (normalized.split("/").includes("..")) throw new Error(`asset("${file}"): the path has to stay in the build`)
    /** Its path in the build, "/search.json" */
    this.path = normalized
    /** What's written */
    this.content = content
    /** The path with a hash of the content, which changes when the content does: "/search.json?v=1a2b3c4d" */
    this.url = `${normalized}?v=${crypto.createHash("md5").update(content).digest("hex").slice(0, 8)}`
  }

  /** The URL, so {{ }} and html`...` put it in as it is */
  toString() {
    return this.url
  }
}

/**
 * A file for the build, made from data: a search index, a feed, a generated image. The build writes it, and a page
 * links to it by this value, its URL with a hash of the content, like the JS and CSS links:
 * `<input data-index="{{ search.index }}">` -> `data-index="/search.json?v=1a2b3c4d"`. The hash only changes when the
 * content does, so browsers and CDNs can keep it until then.
 * @param {string} file Where it goes in the build: "search.json"
 * @param {string | Uint8Array} content
 * @returns {Asset}
 */
export const asset = (file, content) => new Asset(file, content)
