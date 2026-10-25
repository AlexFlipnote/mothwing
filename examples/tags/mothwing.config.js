import { defineConfig } from "mothwing"

export default defineConfig({
  domain: "example.com",
  seo: { siteName: "Moth Notes" },
  js: { scripts: ["js/index.js"], modules: ["js/app.js"] },
  sass: { "scss/index.scss": "css/index.css" },
  // Built into the build by js and sass above, so the sources stay out
  exclude: ["js", "scss"]
})
