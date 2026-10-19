/*
  The reference's exports, grouped by their kind in the order people look for them.
*/
import api from "../../data/api.js"

const GROUPS = [
  { kind: "function", name: "Functions", badge: "f" },
  { kind: "class", name: "Classes", badge: "c" },
  { kind: "type", name: "Types", badge: "T" },
  { kind: "callback", name: "Callback types", badge: "cb" }
]

export default () => ({
  groups: GROUPS
    .map(group => ({ ...group, id: group.name.toLowerCase().replace(" ", "-"), items: api().filter(item => item.kind === group.kind) }))
    .filter(group => group.items.length)
})
