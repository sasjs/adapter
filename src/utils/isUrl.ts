/**
 * Checks if string is in URL format.
 * @param url - string to check.
 */
export const isUrl = (url: string): boolean => {
  const pattern = new RegExp(
    '^(http://|https://)[a-z0-9]+([-.]{1}[a-z0-9]+)*.[a-z]{2,5}(:[0-9]{1,5})?(/.*)?$',
    'gi'
  )

  if (pattern.test(url)) return true
  else
    throw new Error(
      `'${url}' is not a valid url. An example of a valid url is 'http://valid-url.com'.`
    )
}
