import { defineConfig } from "mothwing"

export default defineConfig({
  domain: "example.com",
  seo: { siteName: "Moth Notes" },
  // sitemap.xml, each page dated by its last commit, the notes in a sitemap of their own
  sitemap: { sections: ["notes"] },
  // robots.txt, pointing at the sitemap
  robots: { block: ["GPTBot"] },
  // A CNAME file with the domain, for GitHub Pages
  cname: true,
  // A Content-Security-Policy that allows the site's own files, and its inline scripts by their hash
  csp: true,
  minify: true,
  // aria-current on the nav's links to the page, and to its section
  activeLinks: true
})
