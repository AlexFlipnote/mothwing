import fs from "fs"
import path from "path"
import { defineConfig } from "mothwing"

export default defineConfig({
  domain: "mothwing.dev",
  seo: { siteName: "mothwing" },
  sass: { "scss/docs.scss": "css/docs.css" },
  exclude: ["scss"],
  rerender: ["../../src", "../../README.md"],
  activeLinks: true,
  minify: true,
  csp: true,
  sitemap: true,
  robots: true,
  cname: true,
  // The logo is the package's own, in ../assets, rather than a copy of it in src
  after: [({ site }) => {
    fs.mkdirSync(path.join(site.out, "images"), { recursive: true })
    fs.copyFileSync(path.join(site.root, "../assets/logo.png"), path.join(site.out, "images/logo.png"))
  }]
})
