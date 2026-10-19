# Tags
Paths in tags start at `src/`, the same as the URLs in the build.

| Tag | Does |
| --- | ---- |
| `<x-html src="partials/nav.html"/>` | Pastes in a partial, indented like the tag |
| `<x-js src="/js/index.js"/>` | `<script>` with a `?v=hash` |
| `<x-js src="/js/app.js" module/>` | One of your `modules`, with a modulepreload for each chunk it imports. `preload="/js/data/x.js"` adds one for a file it `import()`s later |
| `<x-css src="/css/index.css"/>` | Stylesheet `<link>` with a `?v=hash` |
| `<x-seo title="..." description="..."/>` | Title, description, canonical URL, link preview tags. `image`, `image-alt` and `image-size="WxH"` for its own preview, `section` and `name` for breadcrumbs in search results |

A tag mothwing doesn't know, or one missing what it needs, fails the build with the page it's on.
