# Pages
`src/pages/about.html` is `/about/`, `src/pages/projects/index.html` is `/projects/`.

`[projects.id].html` makes a page per item of `projects` in the data folder, with its `id` as the URL: `src/pages/projects/[projects.id].html` is `/projects/hexclock/` for `{ "id": "hexclock" }`. An id that's fine in a URL is kept as it is, `moth_notes` included, anything else is made into one: `Hex Clock` is `hex-clock`. The item is `{{ page }}`, and the list links to the pages by the same field, `/projects/{{ project.id }}/`. An item with a `sources` list is dated by those files instead of the whole data file, so editing one item doesn't date every page.

## .data.js
For values that take more than the data folder, a page can have a `.data.js` next to it, whose default export returns them. Its values come before the data folder's:

```js
// src/pages/index.data.js
export default () => ({ updated: new Date().toISOString().slice(0, 10) })
```

`[name].html` with a `.data.js` makes a page per item that returns, each with a `slug`. `posts/[post].html` with a slug of `first-flight` becomes `/posts/first-flight/`. Besides its values, an item can have:

| Key | |
| --- | --- |
| `slug` | The page's URL part: letters, digits, `_`, `-` and `.`, not starting with a dot. `slug()` makes any name into one |
| `sources` | The files its content comes from, relative to `src/`, which the sitemap dates the page by |
| `files` | More files to write, by their path in the build: `{ "rows/list.html": "..." }` |

For building HTML in a `.data.js`, `mothwing/html` has an `html` tagged template, which escapes what goes into it unless it's HTML already, and `slug()`. It runs in browsers too. For files linked by a hash of their content, `mothwing` has `asset()`, see [Data](../data/).

```js
// src/pages/posts/[post].data.js
import { html, slug } from "mothwing/html"

export default () => posts.map(post => ({
  slug: slug(post.title),  // "Moths & lamps" -> "moths-lamps"
  title: post.title,
  body: html`${post.paragraphs.map(text => html`<p>${text}</p>`)}`
}))
```

Two pages that would be written to the same place, like a slug of `about` next to an `about.html`, fail the build.
