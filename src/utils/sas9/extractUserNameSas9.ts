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
  let username = fullName.slice(breakIndex, -1).trim()

  //Create username by SAS method - first 3 chars of every word lowercase
  const usernameSplit = username.split(' ')
  username = usernameSplit
    .map((name: string) =>
      usernameSplit.length > 1
        ? name.slice(0, 3).toLowerCase()
        : name.toLowerCase()
    )
    .join('')

  return username
}
