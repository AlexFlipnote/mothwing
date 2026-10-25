document.querySelector("button")?.addEventListener("click", async () => {
  const { moths } = await import("./data/moths.js")
  document.querySelector("output").textContent = moths.join(", ")
})
