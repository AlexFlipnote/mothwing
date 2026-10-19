# Making it yours
Your own tags, transforms and hooks, in the config, for what's only your site's:

```js
export default defineConfig({
  domain: "example.com",
  // <x-emoji name="coffee"/>
  tags: {
    "x-emoji": ({ attrs }) => `<img src="/emoji/${attrs.name}.png" alt="">`
  },
  // Every page, after its placeholders are filled
  transforms: [(html, route) => html.replace("<body>", `<body data-page="${route.url}">`)],
  // Once the pages are written, `dev` is true on dev renders
  after: [async ({ site, routes, dev }) => { /* draw preview images, ... */ }]
})
```
