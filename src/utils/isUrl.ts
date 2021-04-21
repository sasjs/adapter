/**
 * Checks if string is in URL format.
 * @param url - string to check.
 */
export const isUrl = (url: string): boolean => {
  try {
    const validUrl = new URL(url)
  } catch (_) {
    return false
  }

  return true
}
