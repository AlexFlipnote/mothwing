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
npx mothwing dev     # serves on http://localhost:8080, a change renders just the pages it's in and reloads the browser
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

The folder names are only defaults, `pages`, `partials` and `data` can each be renamed in the config.

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

A page is HTML with a few tags of mothwing's in it, which turn into plain HTML as it builds:

```html
<!-- src/pages/index.html, the page at / -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <x-seo title="Home" description="What the site is about"/>
    <x-css src="/css/index.css"/>
  </head>
  <body>
    <x-html src="partials/nav.html"/>
    <h1>{{ site.name }}</h1>
    <x-js src="/js/index.js"/>
  </body>
</html>
```

`{{ site.name }}` comes from `src/data/site.json`, see [Data](https://mothwing.dev/examples/data/), and the tags are in [Tags](https://mothwing.dev/examples/tags/). In dev, a URL with no page gets your `404.html`.

## Config
Only `domain` is needed. Every option, with its default and what it does, is in the [API reference](https://mothwing.dev/api/Config/).

## Examples
The rest of what mothwing does, part by part. They're in [examples/](examples), and on [mothwing.dev](https://mothwing.dev/examples/):

- [Data](https://mothwing.dev/examples/data/): the data folder and placeholders
- [Loops](https://mothwing.dev/examples/loops/): `<x-each>` and `<x-if>`
- [Pages](https://mothwing.dev/examples/pages/): URLs, a page per item, and `.data.js`
- [Tags](https://mothwing.dev/examples/tags/): the tags mothwing builds into HTML
- [Making it yours](https://mothwing.dev/examples/making-it-yours/): your own tags, transforms and hooks
