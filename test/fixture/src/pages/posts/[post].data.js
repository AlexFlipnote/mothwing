import { asset } from "../../../../../src/assets.js"

export default () => [
  { slug: "first", title: "First", body: "<p>One</p>\n<p>Two</p>", text: asset("posts/first.txt", "One\nTwo") },
  { slug: "second", title: "Second", body: "<p>Three</p>", text: asset("posts/second.txt", "Three") }
]
