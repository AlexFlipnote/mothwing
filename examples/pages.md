# Pages
`src/pages/about.html` is `/about/`, `src/pages/blog/index.html` is `/blog/`.

`[projects.id].html` makes a page per item of `projects` in the data folder, with its `id` as the URL: `src/pages/projects/[projects.id].html` is `/projects/hexclock/` for `{ "id": "hexclock" }`. An id that's fine in a URL is kept as it is, `create_ssh_key` included, anything else is made into one: `Hex Clock` is `hex-clock`. The item is `{{ page }}`, and the list links to the pages by the same field, `/projects/{{ project.id }}/`. An item with a `sources` list is dated by those files instead of the whole data file, so editing one item doesn't date every page.

## .data.js
For values that take more than the data folder, a page can have a `.data.js` next to it, whose default export returns them. Its values come before the data folder's:

```js
// src/pages/index.data.js
export default () => ({ updated: new Date().toISOString() })
```

`[name].html` with a `.data.js` makes a page per item that returns, each with a `slug`. `posts/[post].html` with a slug of `first` becomes `/posts/first/`. Besides its values, an item can have:

| Key | |
| --- | --- |
| `slug` | The page's URL part |
| `sources` | The files its content comes from, relative to `src/`, which the sitemap dates the page by |
| `files` | More files to write, by their path in the build: `{ "rows/list.html": "..." }` |

For building HTML in a `.data.js`, `mothwing/html` has an `html` tagged template, which escapes what goes into it unless it's HTML already, and `slug()`.
