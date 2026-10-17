import { greet } from "./shared.js"

document.body.dataset.greeting = greet("app")
document.body.addEventListener("click", async () => {
  const { more } = await import("./data/lazy.js")
  document.body.dataset.more = more
})
