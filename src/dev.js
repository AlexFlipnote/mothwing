import { spawn } from "child_process"
import esbuild from "esbuild"
import fs from "fs"
import net from "net"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { buildSass, clean, copyAssets, isExcluded, jsBuilds } from "./assets.js"
import { renderSite } from "./build.js"
import { pagesUsing } from "./deps.js"
import { log, posix } from "./log.js"
import { serve } from "./serve.js"

const CLI = fileURLToPath(new URL("../bin/mothwing.js", import.meta.url))

/**
 * @param {number} port
 * @param {string} host
 * @returns {Promise<void>} Rejects when something is already listening on it
 */
const portFree = (port, host) => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once("error", reject)
  server.listen(port, host, () => server.close(() => resolve()))
})

/** @returns {string[]} This machine's addresses on the local network, to open the dev server from a phone */
const lanAddresses = () => Object.values(os.networkInterfaces()).flatMap((list) => list ?? [])
  .filter((i) => i.family === "IPv4" && !i.internal)
  .map((i) => i.address)

/**
 * @param {() => void} changed Called after a build without errors whose files changed
 * @returns {import("esbuild").Plugin}
 */
const jsWatchPlugin = (changed) => ({
  name: "watch-log",
  setup(build) {
    build.initialOptions.metafile = true
    let last = ""
    build.onStart(() => log("JS", "Building JS..."))
    build.onEnd(result => {
      log("JS", result.errors.length ? "Error" : "Done building")
      if (result.errors.length) return
      // The server builds again on every request for the JS, which mustn't reload the page that asked
      const files = Object.keys(result.metafile?.inputs ?? {})
      const stamp = files.map(file => `${file}:${fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0}`).join("\n")
      if (stamp !== last) changed()
      last = stamp
    })
  }
})

/**
 * Builds, serves and rebuilds what changes.
 * @param {import("./config.js").Site} site
 * @param {{ host?: string, port?: number }} [options]
 */
export async function dev(site, { host = "localhost", port = 8080 } = {}) {
  log("WATCH", "Starting to watch for changes...")

  /** Reloads the pages open in a browser, once they're served */
  let reload = () => {}
  const contexts = await Promise.all(jsBuilds(site, {
    minify: false,
    sourcemap: true,
    plugins: [jsWatchPlugin(() => reload())]
  }).map(build => esbuild.context(build)))

  // The port first, so a second dev server stops here, before it wipes the files the running one serves
  try {
    await portFree(port, host)
  } catch (err) {
    await Promise.all(contexts.map(ctx => ctx.dispose()))
    log("SERVE", `Port ${port} is taken, is the dev server already running? (${/** @type {Error} */ (err).message})`)
    process.exit(1)
  }

  await clean(site)
  await copyAssets(site)
  await buildSass(site)
  // What each page is made from, so a change renders just the pages it's in
  let { deps } = await renderSite(site)

  // Served only now: a tab left open asks for the page at once, and the server builds the JS for it, which would
  // land in the folder while it's being wiped
  reload = (await serve(site, contexts[0] ?? await esbuild.context({}), { host, port })).reload
  await Promise.all(contexts.map(ctx => ctx.watch()))
  const hosts = host === "0.0.0.0" ? ["localhost", ...lanAddresses()] : [host]
  for (const name of hosts) log("SERVE", `http://${name}:${port}/`)

  /** @type {import("child_process").ChildProcess | null} */
  let rendering = null
  /** @type {Set<string> | "all" | null} The pages to render next, or all of them */
  let pending = null
  /** @type {NodeJS.Timeout | undefined} */
  let soon

  // In a new process, so the .data.js files and what they import load fresh, Node would otherwise keep the first copy
  const startRender = () => {
    if (rendering || !pending) return
    const job = pending
    pending = null
    const only = job === "all" ? [] : ["--pages", [...job].join(",")]
    rendering = spawn(process.execPath, [CLI, "html", "--root", site.root, ...only], { stdio: ["inherit", "inherit", "inherit", "ipc"] })
    let changed = false
    rendering.on("message", (/** @type {{ deps?: Record<string, string[]>, written?: number }} */ message) => {
      if (message.deps) deps = job === "all" ? message.deps : { ...deps, ...message.deps }
      // The after hooks can write what isn't counted, like preview images
      changed = Boolean(message.written) || site.after.length > 0
    })
    rendering.on("exit", (code) => {
      rendering = null
      if (code === 0 && changed) reload()
      startRender()
    })
  }

  /** @param {string[] | "all"} pages Relative to the pages folder */
  const render = (pages) => {
    pending = pages === "all" || pending === "all" ? "all" : new Set([...pending ?? [], ...pages])
    // A save fires a few events at once, they're rendered together
    clearTimeout(soon)
    soon = setTimeout(startRender, 50)
  }

  // A deleted or renamed file would leave its old output behind, so that starts over from an empty folder
  const rebuildAll = async () => {
    log("WATCH", "A file was removed, building everything again...")
    await clean(site)
    await copyAssets(site)
    await buildSass(site)
    await Promise.all(contexts.map(ctx => ctx.rebuild()))
    render("all")
  }

  const pagesDir = posix(path.relative(site.src, site.pages))
  /** @type {NodeJS.Timeout | undefined} */
  let restart
  /** @param {string} file Absolute path */
  const changed = (file) => {
    const relative = posix(path.relative(site.src, file))
    if (!fs.existsSync(file)) {
      clearTimeout(restart)
      restart = setTimeout(() => rebuildAll().catch(err => log("WATCH", err.message)), 200)
      return
    }
    if (fs.statSync(file).isDirectory()) return

    const page = relative.startsWith(`${pagesDir}/`) && relative.slice(pagesDir.length + 1).replace(/\.data\.js$/, ".html")
    const using = pagesUsing(deps, relative)
    const rerender = site.rerender.some(dir => relative === dir || relative.startsWith(`${dir}/`))
    if (/\.(scss|sass)$/.test(file))
      // Sass the pages are made from too, like a CSS framework's docs, renders them once the CSS is built
      buildSass(site).then(() => rerender ? render("all") : reload()).catch(err => log("CSS", err.message))
    else if (page && page.endsWith(".html"))
      render([page])
    else if (using.length)
      render(using)
    else if (rerender)
      render("all")
    else if (!isExcluded(site, file))
      copyAssets(site, file).then(reload).catch(err => log("ASSET", err.message))
  }

  fs.watch(site.src, { recursive: true }, (_, filename) => filename && changed(path.join(site.src, filename)))
  // What's in src is watched already, rerender can also name files and folders outside it
  for (const dir of site.rerender.filter(dir => dir.startsWith("../"))) {
    const watched = path.join(site.src, dir)
    if (!fs.existsSync(watched)) throw new Error(`rerender: can't find ${dir}`)
    if (fs.statSync(watched).isDirectory()) {
      fs.watch(watched, { recursive: true }, (_, filename) => filename && changed(path.join(watched, filename)))
    } else {
      fs.watch(watched, () => changed(watched))
    }
  }
}
