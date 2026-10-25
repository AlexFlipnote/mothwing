import { asset } from "mothwing"

export default () => ({ index: asset("search.json", JSON.stringify(["moths", "butterflies"])) })
