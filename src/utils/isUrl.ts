/**
 * Checks if string is in URL format.
 * @param str - string to check.
 */
export const isUrl = (str: string): boolean => {
  const supportedProtocols = ['http:', 'https:']

  try {
    const url = new URL(str)

    if (!supportedProtocols.includes(url.protocol)) return false
  } catch (_) {
    return false
  }

  return true
}
