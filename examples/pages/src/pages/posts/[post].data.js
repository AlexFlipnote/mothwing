import { html, slug } from "mothwing/html"

const posts = [
  { title: "First flight", paragraphs: ["Off the porch light at last.", "Straight into the next one."] },
  { title: "Moths & lamps", paragraphs: ["Nobody knows for sure why they circle them."] }
]

export default () => posts.map(post => ({
  slug: slug(post.title),
  title: post.title,
  body: html`${post.paragraphs.map(text => html`<p>${text}</p>`)}`
}))
