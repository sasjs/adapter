export const isRelativePath = (uri: string): boolean =>
  !!uri && !uri.startsWith('/')
