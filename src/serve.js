import crypto from "crypto"
import fs from "fs"
import http from "http"
import path from "path"

const RELOAD = "/__mothwing/reload"
// A file rather than inline, so a csp of only 'self' lets it run
const RELOAD_TAG = `<script src="${RELOAD}.js"></script>`
// A WebSocket rather than an EventSource, which keeps one of the 6 connections a browser opens to a host for every
// tab, so with a few tabs open the next requests wait for one to free up
const RELOAD_JS = `const connect = () => {
  const socket = new WebSocket(\`ws\${location.protocol === "https:" ? "s" : ""}://\${location.host}${RELOAD}\`)
  socket.addEventListener("message", () => location.reload())
  // The dev server stopping closes it, it connects again once it's back
  socket.addEventListener("close", () => setTimeout(connect, 1000))
}
connect()
`
// The reload message, as a WebSocket text frame
const RELOAD_FRAME = Buffer.from([0x81, 6, ...Buffer.from("reload")])

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
  /** @type {Set<import("stream").Duplex>} */
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

  server.on("upgrade", (req, socket) => {
    if (req.url !== RELOAD || req.headers.upgrade?.toLowerCase() !== "websocket") return socket.destroy()
    const accept = crypto.createHash("sha1").update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64")
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    clients.add(socket)
    // The page only listens, all it sends is a close frame when it goes
    socket.on("data", (data) => (data[0] & 0x0f) === 8 && socket.end(Buffer.from([0x88, 0])))
    socket.on("error", () => socket.destroy())
    socket.on("close", () => clients.delete(socket))
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
      for (const socket of clients) socket.write(RELOAD_FRAME)
    }, 100)
  }
  return { server, reload }
}
