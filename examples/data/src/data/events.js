import fs from "fs"

// events.csv isn't a .json or .js, so it isn't data of its own, this reads it
export const sources = ["data/events.csv"]

export default () => {
  const list = fs.readFileSync(new URL("events.csv", import.meta.url), "utf8").trim().split(/\r?\n/).slice(1)
    .map(line => {
      const [date, name] = line.split(",")
      return { date, name }
    })
  return { list, none: list.length === 0 }
}
