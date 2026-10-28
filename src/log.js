const RESET = "\x1b[0m"
const GREY = "\x1b[38;5;240m"
const COLOURS = {
  info: ["\x1b[38;5;38m", "\x1b[38;5;117m"],
  WARN: ["\x1b[38;5;220m", "\x1b[38;5;229m"],
  ERROR: ["\x1b[38;5;203m", "\x1b[38;5;217m"]
}

/**
 * @param {NodeJS.WriteStream} stream
 * @returns {boolean} Off for a pipe or a file, and with NO_COLOR set, on with FORCE_COLOR
 */
const useColour = (stream) => {
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true
  return Boolean(stream.isTTY)
}

/**
 * Prints a line the way mothwing's own are, `[  HTML ] 2026-01-01 12:00:00 message`, for hooks to report in. "WARN"
 * and "ERROR" stand out in their own colours, and ERROR goes to stderr.
 * @param {string} type Short tag, like "HTML"
 * @param {string} message
 */
export function log(type, message) {
  const now = new Date()
  /** @param {number} num */
  const pad = (num) => String(num).padStart(2, "0")
  const formattedDate =
    now.getFullYear() + "-" +
    pad(now.getMonth() + 1) + "-" +
    pad(now.getDate()) + " " +
    pad(now.getHours()) + ":" +
    pad(now.getMinutes()) + ":" +
    pad(now.getSeconds())

  const error = type === "ERROR"
  const tag = type.padStart(5)
  const [main, light] = COLOURS[type === "WARN" || error ? type : "info"]
  const line = useColour(error ? process.stderr : process.stdout)
    ? `${light}[ ${main}${tag}${light} ]${RESET} ${GREY}${formattedDate}${RESET} ${message}`
    : `[ ${tag} ] ${formattedDate} ${message}`
  if (error) console.error(line)
  else console.log(line)
}

/**
 * @param {number} count
 * @param {string} word "page"
 * @returns {string} "1 page", "0 pages", "2 pages"
 */
export const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`

/**
 * @param {string} file
 * @returns {string} With / separators, however the OS writes it
 */
export const posix = (file) => file.split("\\").join("/")
