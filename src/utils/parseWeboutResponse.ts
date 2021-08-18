import { WeboutResponseError } from '../types/errors'

export const parseWeboutResponse = (response: string, url?: string) => {
  let sasResponse = ''

  if (response.includes('>>weboutBEGIN<<')) {
    try {
      sasResponse = response
        .split('>>weboutBEGIN<<')[1]
        .split('>>weboutEND<<')[0]
    } catch (e) {
      if (url) throw new WeboutResponseError(url)
      sasResponse = ''
      console.error(e)
    }
  }

  return sasResponse
}
