/**
 * Dictionary should contain only languages in SAS where `logout` text
 * is represented with more then one word
 */
const dictionary = ['Log Off']

/**
 * Extracts user full name assuming the first word after "title" means log off if not found otherwise in the dictionary
 * @param response SAS response content
 * @returns user full name
 */
export const extractUserLongNameSas9 = (response: string) => {
  const regex = /"title":\s?".*?"/

  const matched = response?.match(regex)
  let fullName = matched?.[0].split(':')[1].trim()
  let breakIndex = fullName?.indexOf(' ')

  if (!fullName) return 'unknown'

  dictionary.map((logoutWord) => {
    const index = fullName?.indexOf(logoutWord) || -1

    if (index > -1) {
      breakIndex = index + logoutWord.length
    }
  })

  //Cut only name
  return fullName.slice(breakIndex, -1).trim()
}
