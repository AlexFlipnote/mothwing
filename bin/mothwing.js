#!/usr/bin/env node
import { build, clean, dev, loadConfig, renderSite } from "../src/index.js"

const USAGE = `Usage: mothwing <command> [--root <dir>]

Commands:
  build    Build the site for production
  dev      Serve it and rebuild on changes, takes --host and --port
  clean    Remove the build folder
  html     Render only the pages, into an existing build, --pages a.html,b.html for just those`

/**
 * @param {string} name
 * @returns {string | undefined}
 */
const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

/** @type {Record<string, (site: import("../src/index.js").Site) => Promise<void>>} */
const commands = {
  build: (site) => build(site),
  dev: (site) => dev(site, { host: flag("host"), port: Number(flag("port")) || undefined }),
  clean: (site) => clean(site),
  html: async (site) => {
    const pages = flag("pages")
    const rendered = await renderSite(site, { only: pages ? new Set(pages.split(",")) : undefined })
    // Run by dev, which keeps track of what the pages are made from, and reloads the browser if any changed
    process.send?.(rendered)
  }
}
const command = commands[process.argv[2]]

if (!command) {
  console.log(USAGE)
  process.exit(process.argv[2] ? 1 : 0)
}

try {
  await command(await loadConfig(flag("root")))
} catch (err) {
  console.error(`mothwing: ${/** @type {Error} */ (err).message}`)
  process.exit(1)
}
