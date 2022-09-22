/**
 * Dictionary should contain only languages in SAS where `logout` text
 * is represented with more then one word
 */
const dictionary = ['Log Off']

/**
 * Extracts username assuming the first word after "title" means log off if not found otherwise in the dictionary
 * @param response SAS response content
 * @returns username
 */
export const extractUserNameSas9 = (response: string) => {
  const regex = /"title":\s?".*"/

  const matched = response?.match(regex)
  let username = matched?.[0].split(':')[1].trim()
  let breakIndex = username?.indexOf(' ')

  dictionary.map((logoutWord) => {
    const index = username?.indexOf(logoutWord) || -1

    if (index > -1) {
      breakIndex = index + logoutWord.length
    }
  })

  username = username?.slice(breakIndex, -1)

  if (!username) return 'unknown'

  return username.trim()
}
