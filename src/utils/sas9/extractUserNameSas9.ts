export const extractUserNameSas9 = (response: string) => {
  const regex = /"title":\s?"Log Off [0-1a-zA-Z ]*"/
  const fallbackRegex = /"title":\s?"[0-1a-zA-Z ]*"/
  const matched = response?.match(regex) || response?.match(fallbackRegex)
  const username = matched?.[0].slice(17, -1)

  if (!username) return 'unknown (error fetching username)'
  if (!username.trim().includes(' ')) return username.trim()

  return username
    .split(' ')
    .map((name: string) => name.slice(0, 3).toLowerCase())
    .join('')
}
