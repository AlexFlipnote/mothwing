# Going live
What a site turns on before it's published, each off until the config asks for it:

```js
// mothwing.config.js
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
```

| Option | Makes |
| --- | --- |
| `sitemap` | `sitemap.xml` with every page, each dated by the last commit to the files it's made from. `sections` gives a section a sitemap of its own, `sitemap-notes.xml`, behind a sitemap index, so Search Console shows how each is indexed |
| `robots` | `robots.txt`, allowing every crawler and pointing at the sitemap. `block` turns crawlers away by name, `disallow` keeps paths out of all of them |
| `cname` | A `CNAME` file with the domain, which a GitHub Pages deploy needs every time |
| `csp` | A Content-Security-Policy `<meta>` on every page, allowing only the site's own files, and its inline scripts by their hash. An object sets directives over the defaults: `{ "style-src": "'self' 'unsafe-inline'" }` |
| `minify` | Production pages without comments and the whitespace that doesn't show, the inline scripts and styles minified |
| `activeLinks` | `aria-current="page"` on links to the page they're on, `"true"` on links to its section, for the nav to style |

```html
<!-- src/partials/nav.html, on /notes/luna-moth/ -->
<a href="/">Home</a>
<a href="/notes/" aria-current="true">Notes</a>
```

`src/pages/404.html` is the page for a URL with nothing at it. It's kept in the build's root as `404.html`, where hosts like GitHub Pages look for it, and out of the sitemap. In dev, a URL with no page gets it too.

Dev builds leave out minifying and the sitemap's dates, so a change shows up at once.
