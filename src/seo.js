import { escapeHtml, unescapeHtml } from "./html.js"

/**
 * @param {string} description HTML, as the <x-seo> attribute has it
 * @param {number} max
 * @returns {string} At most `max` characters of text, cut at a word so it ends on "...", still HTML
 */
export function fitDescription(description, max) {
  const text = unescapeHtml(description)
  if (text.length <= max) return description
  const cut = text.slice(0, max - 3)
  return escapeHtml(`${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,.;:-]+$/, "")}...`)
}

/**
 * The <title>, description, canonical URL, link preview tags and breadcrumbs for <x-seo title="..." description="..."/>.
 * Optional: image="..." image-alt="..." image-size="WxH" for its own preview image, and section="..." name="..." for its
 * breadcrumb in search results.
 * @param {import("./config.js").Site} site
 * @param {import("./routes.js").Route} route
 * @param {Record<string, string | true>} attrs
 * @returns {string[]} The tags, one per line
 */
export function seoTags(site, route, attrs) {
  /**
   * @param {string} name
   * @returns {string | undefined}
   */
  const attr = (name) => {
    const value = attrs[name]
    return typeof value === "string" ? value : undefined
  }
  const { maxTitle, maxDescription } = site.seo
  const siteName = site.seo.siteName ? escapeHtml(site.seo.siteName) : ""
  const locale = escapeHtml(site.seo.locale)
  const pageTitle = attr("title")
  const pageDescription = attr("description")
  if (!pageTitle || !pageDescription) throw new Error(`${route.source}: <x-seo> needs a title and a description`)
  const description = fitDescription(pageDescription, maxDescription)
  // The front page keeps it, for people searching for the site by its name, unless it's the site's name already
  const named = !siteName || unescapeHtml(pageTitle) === site.seo.siteName ? pageTitle : `${pageTitle} - ${siteName}`
  const title = route.url === "/" || unescapeHtml(named).length <= maxTitle ? named : pageTitle

  const url = site.url ? `${site.url}${route.url}` : null
  /**
   * @param {string} key
   * @param {string} name
   * @param {string | number} content
   */
  const meta = (key, name, content) => `<meta ${key}="${name}" content="${content}">`
  // The attributes are HTML, the JSON is in a <script>, where only "</script" could end it early
  /** @param {object} data */
  const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`

  // Lets Google show the site's name in results, it only reads this from the front page
  const siteNameLd = url && route.url === "/"
    ? [jsonLd({ "@context": "https://schema.org", "@type": "WebSite", name: site.seo.siteName, url })]
    : []

  // section="Gathering" name="Cedar Log" shows as site › Gathering › Cedar Log in results
  const section = attr("section")
  const name = attr("name")
  const crumbs = url ? [
    [siteName, `${site.url}/`],
    ...section ? [[section, `${site.url}${route.url.replace(/[^/]+\/$/, "")}`]] : [],
    [name ?? "", url]
  ] : []
  const breadcrumbs = url && name
    ? [jsonLd({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name: unescapeHtml(name), item }))
    })]
    : []

  const [width, height] = (attr("image-size") ?? "").split("x").map(Number)
  const image = url && (
    attr("image")
      ? { src: `${site.url}${attr("image")}`, width, height, alt: attr("image-alt") ?? "" }
      : site.seo.image && { ...site.seo.image, src: `${site.url}${escapeHtml(site.seo.image.src)}`, alt: escapeHtml(site.seo.image.alt) }
  )
  // A wide image shows across the whole preview, a square one as a thumbnail next to the text
  const card = image && image.width > image.height ? "summary_large_image" : "summary"

  return [
    `<title>${title}</title>`,
    meta("name", "description", description),
    ...url ? [`<link rel="canonical" href="${url}">`] : [],
    // Lets Google show the preview image big, in results and Discover, it otherwise picks a size itself
    meta("name", "robots", "max-image-preview:large"),
    meta("property", "og:locale", locale),
    meta("property", "og:type", "website"),
    ...siteName ? [meta("property", "og:site_name", siteName)] : [],
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    ...url ? [meta("property", "og:url", url)] : [],
    ...image
      ? [
        meta("property", "og:image", image.src),
        meta("property", "og:image:width", image.width),
        meta("property", "og:image:height", image.height),
        meta("property", "og:image:alt", image.alt)
      ]
      : [],
    meta("name", "twitter:card", card),
    ...siteNameLd,
    ...breadcrumbs
  ]
}
