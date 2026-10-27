import { defineConfig } from "mothwing"

export default defineConfig({
  domain: "example.com",
  seo: { siteName: "Moth Notes" },
  sitemap: { sections: ["notes"] },
  robots: { block: ["GPTBot"] },
  cname: true,
  csp: true,
  minify: true,
  activeLinks: true
})
