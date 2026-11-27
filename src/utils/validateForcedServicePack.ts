/** Validate the entire destructive deployment scope before making any request. */
export function validateForcedServicePack(appLoc: string, pack: any): void {
  const safeName = (value: unknown): value is string =>
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    value !== '.' &&
    value !== '..' &&
    !/[\/\\%?#\u0000-\u001f\u007f]/.test(value) &&
    !/[. ]$/.test(value) &&
    !/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value)

  if (typeof appLoc !== 'string' || !appLoc.startsWith('/'))
    throw new Error('Invalid forced deployment appLoc')
  const parts = appLoc.slice(1).split('/')
  if (
    parts.length < 2 ||
    !parts.every(safeName) ||
    /^(home|homes|user|my folder|myfolder|@myfolder|@myrecyclebin)$/i.test(
      parts[0]
    ) ||
    (/^users$/i.test(parts[0]) && parts.length < 3) ||
    (/^users$/i.test(parts[0]) &&
      parts.length === 3 &&
      /^my folder$/i.test(parts[2])) ||
    parts.slice(1).some((part) => /^users$/i.test(part))
  )
    throw new Error('Unsafe forced deployment appLoc')

  const seen = new Set<object>()
  const validate = (members: unknown): void => {
    if (!Array.isArray(members)) throw new Error('Invalid service pack members')
    if (seen.has(members)) throw new Error('Cyclic service pack')
    seen.add(members)
    const names = new Set<string>()
    for (const member of members) {
      if (!member || typeof member !== 'object' || !safeName(member.name))
        throw new Error('Invalid service pack member name')
      const name = member.name.toLowerCase()
      if (names.has(name)) throw new Error('Ambiguous service pack member name')
      names.add(name)
      if (member.type === 'folder') {
        if (member.members !== undefined) validate(member.members)
      } else if (member.type === 'service') {
        if (Array.from(member.name).length > 100)
          throw new Error('Invalid service name: exceeds 100 characters')
        if (typeof member.code !== 'string')
          throw new Error('Invalid service code')
        if (member.members !== undefined)
          throw new Error('Invalid service members')
      } else if (member.type === 'file') {
        // The existing file API sends this name verbatim in a quoted HTTP header.
        // Without a verified Viya encoding contract, reject unsafe values before
        // the destructive move rather than silently rename or escape them.
        if (!/^[\x20-\x21\x23-\x7e]+$/.test(member.name))
          throw new Error('Invalid file name for forced deployment HTTP header')
        if (typeof member.code !== 'string' && !ArrayBuffer.isView(member.code))
          throw new Error('Invalid file content')
        if (member.members !== undefined)
          throw new Error('Invalid file members')
      } else {
        throw new Error('Invalid service pack member type')
      }
    }
    seen.delete(members)
  }
  if (!pack || typeof pack !== 'object') throw new Error('Invalid service pack')
  validate(pack.members)
}
