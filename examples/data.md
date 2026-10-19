# Data
Every file in `src/data/` is in every page by its name. `projects.json` is `{{ projects }}`, a folder is an object of its files. A `.js` file's default export is its value, called first when it's a function, for data worked out at build time:

```js
// src/data/site.js
export default () => ({ year: new Date().getFullYear() })
```

```html
<h1>{{ title }}</h1>              <!-- as text, escaped -->
{{{ intro }}}                     <!-- as HTML, every line indented like the placeholder -->
<footer>{{ site.year }}</footer>  <!-- into objects with dots -->
```

HTML on a line of its own, from `{{{ }}}` or a partial, is indented like it, all but the inside of a `<pre>` or `<textarea>`, where the spaces are part of what shows.

An attribute that's a placeholder and nothing else follows its value: `false` or `null` leaves it out, and `true` makes it a bare attribute.

```html
<option value="{{ group.slug }}" selected="{{ group.selected }}">  <!-- selected, or nothing -->
<section hidden="{{ events.none }}">                               <!-- hidden, or nothing -->
```

A `.js` file can also say what it reads, relative to `src/`. The pages using it are dated by those files in the sitemap, and render again in dev when they change:

```js
// src/data/events.js
export const sources = ["js/data/lodestone.json"]
```

## Generated files
A file made from data, like a search index or a feed, comes from `asset()` in `mothwing/html`. The build writes it, and a page links to it by its value, with a hash of the content like the JS and CSS links. The URL only changes when the content does, so browsers and CDNs can keep it until then:

```js
// src/data/search.js
import { asset } from "mothwing/html"

export const sources = ["js/data"]
export default () => ({ index: asset("search.json", JSON.stringify(searchIndex())) })
```

```html
<input type="search" data-index="{{ search.index }}">  <!-- data-index="/search.json?v=1a2b3c4d" -->
```

A page's `.data.js` can make them too, for a file of its own.
