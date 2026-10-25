# Tags
Paths in tags start at `src/`, the same as the URLs in the build.

| Tag | Does |
| --- | ---- |
| `<x-html src="partials/nav.html"/>` | Pastes in a partial, indented like the tag |
| `<x-js src="/js/index.js"/>` | `<script>` with a `?v=hash` |
| `<x-js src="/js/app.js" module/>` | One of your `modules`, with a modulepreload for each chunk it imports. `preload="/js/data/moths.js"` adds one for a file it `import()`s later |
| `<x-css src="/css/index.css"/>` | Stylesheet `<link>` with a `?v=hash` |
| `<x-seo title="..." description="..."/>` | Title, description, canonical URL, link preview tags. `image`, `image-alt` and `image-size="WxH"` for its own preview, `section` and `name` for breadcrumbs in search results |

```html
<!-- src/pages/index.html -->
<head>
  <meta charset="utf-8">
  <x-seo title="Moths" description="The moths that visit the porch light, and what they're called."/>
  <x-css src="/css/index.css"/>
</head>
<body>
  <x-html src="partials/nav.html"/>
  ...
  <x-js src="/js/index.js"/>
  <x-js src="/js/app.js" module preload="/js/data/moths.js"/>
</body>
```

The JS is bundled by `js` in the config, and the CSS compiled from Sass by `sass`, with `sass` installed next to mothwing. Their sources are kept out of the build by `exclude`:

```js
// mothwing.config.js
export default defineConfig({
  domain: "example.com",
  seo: { siteName: "Moth Notes" },
  js: { scripts: ["js/index.js"], modules: ["js/app.js"] },
  sass: { "scss/index.scss": "css/index.css" },
  exclude: ["js", "scss"]
})
```

Plain CSS needs neither, a `src/css/index.css` is copied into the build as it is.

A tag mothwing doesn't know, one missing what it needs, or one with an attribute it doesn't take, fails the build with the page it's on.
