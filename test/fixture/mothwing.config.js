import fs from "fs"
import path from "path"

/** @type {import("mothwing").Config} */
export default {
  domain: "example.com",
  js: { scripts: ["js/main.js"], modules: ["js/app.js", "js/other.js"] },
  exclude: ["js"],
  seo: { siteName: "Example" },
  minify: true,
  sitemap: { sections: ["posts"], dates: false },
  robots: { block: ["BadBot"], disallow: ["/private/"] },
  cname: true,
  csp: true,
  // The posts belong to the front page too, as a test of deciding links yourself
  activeLinks: (href, route) => href === "/" && route.url.startsWith("/posts/") ? "section" : undefined,
  tags: {
    "x-shout": ({ attrs }) => `<strong>${String(attrs.text).toUpperCase()}</strong>`
  },
  transforms: [(html) => html.replace("<body>", "<body data-transformed>")],
  after: [({ site, routes, dev }) => fs.writeFileSync(path.join(site.out, "after.json"), JSON.stringify({ pages: routes.length, dev }))]
}
