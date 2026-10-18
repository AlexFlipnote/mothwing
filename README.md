<img src="https://raw.githubusercontent.com/AlexFlipnote/mothwing/master/assets/banner-slim.png" alt="mothwing, a moth written as <|>: Write HTML, ship HTML.">

**Write HTML, ship HTML.** A small static site builder for pages as light as a moth's wing, with hashed asset links and modulepreloads for code split JS. The rest is there when you ask for it: SEO tags, a Content-Security-Policy that allows only your own inline scripts, sitemaps dated from git, robots.txt and minified HTML.

It was born as the build script of [ffxiv.watch](https://ffxiv.watch), and got tweaked over time until I was a little too proud of it to keep it there. So it branched out into its own thing, for any site that wants the same.

## What it isn't
mothwing isn't a framework. There are no components, and nothing runs in the browser that you didn't write. If you want those, Astro and SvelteKit are great.

I did try them, and others, before making my own. They're good at what they do, but I wanted full control of the output: every byte of HTML exactly as I wrote it, and as few dependencies as possible between my files and the finished pages. mothwing is for when you want the same.

## Built with mothwing
| Site | Source | |
| --- | --- | --- |
| [ffxiv.watch](https://ffxiv.watch) | [AlexFlipnote/ffxiv.watch](https://github.com/AlexFlipnote/ffxiv.watch) | Large: 3000+ pages from game data, code split JS, link preview images, sitemaps per section |
| [alexflipnote.dev](https://alexflipnote.dev) | [AlexFlipnote/alexflipnote.github.io](https://github.com/AlexFlipnote/alexflipnote.github.io) | Small: a handful of pages, a JSON file and some Markdown docs |

## Getting started
```sh
npm install --save-dev mothwing
npx mothwing dev     # serves on http://localhost:8080, a change renders just the pages it's in
npx mothwing build   # production build into dist/
```

A site is a `mothwing.config.js` and a `src/` folder. The build mirrors `src/`, so `src/images/logo.png` is `/images/logo.png`:

```
mothwing.config.js
src/
  pages/           every page, the folders are the URLs: about.html -> /about/
  partials/        bits of HTML the pages share
  data/            JSON and JS the pages are filled from
  js/              bundled by esbuild
  ...              everything else is copied as it is
```

```js
import { defineConfig } from "mothwing"

export default defineConfig({
  domain: "example.com",
  js: { scripts: ["js/index.js"] },
  exclude: ["js"]
})
```

`defineConfig` does nothing but give your editor the config's types, so every option autocompletes and a typo is underlined. Without the import, a JSDoc comment does the same:

```js
/** @type {import("mothwing").Config} */
export default { ... }
```

An option mothwing doesn't know fails the build either way.

## Data
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

## Loops
```html
<ul>
  <x-each items="projects" as="project">
    <li>
      <x-if value="project.url"><a href="{{ project.url }}">{{ project.name }}</a></x-if>
      <x-if not="project.url">{{ project.name }}</x-if>
    </li>
  </x-each>
</ul>
```

`<x-each>` repeats its content per item, `index="i"` names the item's position. `<x-if value="...">` shows its content when the value is there and not empty, `not="..."` when it isn't. On lines of their own, they leave no empty lines behind and their content keeps the indent it would have by hand.

`items`, `value` and `not` take a name as it is, `items="projects"`, not a placeholder. The rest of the tags' attributes can have placeholders, `<x-seo title="{{ page.name }}"/>`.

Every tag is ordinary HTML to an editor or formatter. Templates formatted by Prettier build to the same pages.

## Pages
`src/pages/about.html` is `/about/`, `src/pages/blog/index.html` is `/blog/`.

`[projects.id].html` makes a page per item of `projects` in the data folder, with its `id` as the URL: `src/pages/projects/[projects.id].html` is `/projects/hexclock/` for `{ "id": "hexclock" }`. An id that's fine in a URL is kept as it is, `create_ssh_key` included, anything else is made into one: `Hex Clock` is `hex-clock`. The item is `{{ page }}`, and the list links to the pages by the same field, `/projects/{{ project.id }}/`. An item with a `sources` list is dated by those files instead of the whole data file, so editing one item doesn't date every page.

### .data.js
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

## Tags
Paths in tags start at `src/`, the same as the URLs in the build.

| Tag | Does |
| --- | ---- |
| `<x-html src="partials/nav.html"/>` | Pastes in a partial, indented like the tag |
| `<x-js src="/js/index.js"/>` | `<script>` with a `?v=hash` |
| `<x-js src="/js/app.js" module/>` | One of your `modules`, with a modulepreload for each chunk it imports. `preload="/js/data/x.js"` adds one for a file it `import()`s later |
| `<x-css src="/css/index.css"/>` | Stylesheet `<link>` with a `?v=hash` |
| `<x-seo title="..." description="..."/>` | Title, description, canonical URL, link preview tags. `image`, `image-alt` and `image-size="WxH"` for its own preview, `section` and `name` for breadcrumbs in search results |

A tag mothwing doesn't know, or one missing what it needs, fails the build with the page it's on.

## Config
Only `domain` is needed. Folders are relative to `src/`.

| Option | Default | |
| --- | --- | --- |
| `src`, `out` | `"src"`, `"dist"` | Relative to the config |
| `pages` | `"pages"` | |
| `data` | `"data"` | Its files are in every page, it isn't copied to the build |
| `notFound` | `"404.html"` | Kept in the build's root, out of the sitemap |
| `js` | | `scripts` are bundled on their own, `modules` together, sharing their common code in chunks. `chunks` sets the chunks' folder, next to the modules by default |
| `sass` | `{}` | Sass to compile, `{ "scss/index.scss": "css/index.css" }`, needs `sass` installed |
| `exclude` | `[]` | Folders left out of the build, like the JS sources: `["js"]`. Pages and partials always are |
| `rerender` | `[]` | Folders and files your `.data.js` reads with `fs`, whose changes render every page in dev. They can be outside `src`, like `"../README.md"`, and are watched too, Sass in them builds the CSS first. What pages import, include or use from the data folder is followed on its own |
| `seo` | | For `<x-seo>`: `siteName`, `locale`, `image` (the default preview), `maxTitle`, `maxDescription` |
| `esbuild` | `{}` | esbuild options for every bundle |

### Extras
Off until you turn them on. `true` turns one on as it comes, an object changes how it works.

| Option | Turned on | Object |
| --- | --- | --- |
| `minify` | Minifies the HTML of production builds | html-minifier-terser options |
| `csp` | A `<meta>` Content-Security-Policy: only your own files, and your inline scripts by their hash | Directives over the defaults, `{ "style-src": "'self' 'unsafe-inline'" }` |
| `sitemap` | `sitemap.xml` with every page, each dated by the last commit to its files | `sections` that get a sitemap each, behind a sitemap index, for big sites. `dates: false` to leave git out |
| `robots` | `robots.txt` that allows everything, pointing at the sitemap | `block` crawlers by name, `disallow` paths |
| `cname` | `CNAME` with the domain, for GitHub Pages | |
| `activeLinks` | `aria-current="page"` on links to the page they're on, `"true"` on links to its section | A function `(href, route)` returning `"page"`, `"section"` or `false`, `undefined` keeps the default |

## Making it yours
For what's only your site's:

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
