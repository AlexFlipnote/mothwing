import fs from "fs"
import http from "http"
import path from "path"

const RELOAD = "/__mothwing/reload"
// A file rather than inline, so a csp of only 'self' lets it run
const RELOAD_TAG = `<script src="${RELOAD}.js"></script>`
const RELOAD_JS = `new EventSource("${RELOAD}").addEventListener("reload", () => location.reload())\n`

/**
 * Sends a page with the reload script in it.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} html
 * @param {http.IncomingHttpHeaders} [headers]
 */
function sendPage(res, status, html, headers = {}) {
  const end = html.lastIndexOf("</body>")
  const body = end > -1 ? `${html.slice(0, end)}${RELOAD_TAG}\n${html.slice(end)}` : `${html}\n${RELOAD_TAG}`
  res.writeHead(status, { ...headers, "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(body) })
  res.end(body)
}

/**
 * Serves the build through esbuild's server, which waits for a JS build in progress. In front of it, what isn't there
 * gets the 404 page, and every page gets a script that reloads it after a change.
 * @param {import("./config.js").Site} site
 * @param {import("esbuild").BuildContext} context
 * @param {{ host: string, port: number }} options
 * @returns {Promise<{ server: http.Server, reload: () => void }>} `reload` reloads the pages open in a browser
 */
export async function serve(site, context, { host, port }) {
  const esbuild = await context.serve({ servedir: site.out, host: "127.0.0.1" })
  const notFound = path.join(site.out, site.notFound)
  /** @type {Set<http.ServerResponse>} */
  const clients = new Set()

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  const sendNotFound = (req, res) => {
    if (req.headers.accept?.includes("text/html") && fs.existsSync(notFound)) return sendPage(res, 404, fs.readFileSync(notFound, "utf8"))
    res.writeHead(404, { "content-type": "text/plain" })
    res.end("404 - Not Found")
  }

  const server = http.createServer((req, res) => {
    if (req.url === RELOAD) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
      res.write(": connected\n\n")
      clients.add(res)
      req.on("close", () => clients.delete(res))
      return
    }
    if (req.url === `${RELOAD}.js`) {
      res.writeHead(200, { "content-type": "text/javascript" })
      res.end(RELOAD_JS)
      return
    }
    // esbuild lists the files of a folder without a page, where the site would have none
    const folder = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname)
    if (folder.endsWith("/") && !fs.existsSync(path.join(site.out, folder, "index.html"))) return sendNotFound(req, res)

    const proxy = http.request({ host: "127.0.0.1", port: esbuild.port, path: req.url, method: req.method, headers: req.headers }, (from) => {
      const status = from.statusCode ?? 502
      if (status === 404) {
        from.resume()
        sendNotFound(req, res)
      } else if (from.headers["content-type"]?.startsWith("text/html")) {
        /** @type {Buffer[]} */
        const chunks = []
        from.on("data", chunk => chunks.push(chunk))
        from.on("end", () => sendPage(res, status, Buffer.concat(chunks).toString(), from.headers))
      } else {
        res.writeHead(status, from.headers)
        from.pipe(res)
      }
    })
    proxy.on("error", (err) => {
      res.writeHead(502, { "content-type": "text/plain" })
      res.end(err.message)
    })
    req.pipe(proxy)
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => resolve(undefined))
  })
  /** @type {NodeJS.Timeout | undefined} */
  let soon
  // A save can finish a few builds at once, one reload is enough
  const reload = () => {
    clearTimeout(soon)
    soon = setTimeout(() => {
      for (const res of clients) res.write("event: reload\ndata:\n\n")
    }, 100)
  }
  return { server, reload }
}
