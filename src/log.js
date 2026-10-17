/**
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

  console.log(`[ ${type.padStart(5)} ] ${formattedDate} ${message}`)
}

/**
 * @param {string} file
 * @returns {string} With / separators, however the OS writes it
 */
export const posix = (file) => file.split("\\").join("/")
