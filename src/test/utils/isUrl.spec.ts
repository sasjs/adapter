import { isUrl } from '../../utils/isUrl'

describe('urlValidator', () => {
  it('should return true with an HTTP URL', () => {
    const url = 'http://google.com'

    expect(isUrl(url)).toEqual(true)
  })

  it('should return true with an HTTPS URL', () => {
    const url = 'https://google.com'

    expect(isUrl(url)).toEqual(true)
  })

  it('should return true when the URL is blank', () => {
    const url = ''

    expect(isUrl(url)).toEqual(false)
  })

  it('should return false when the URL has not supported protocol', () => {
    const url = 'htpps://google.com'

    expect(isUrl(url)).toEqual(false)
  })

  it('should return false when the URL is null', () => {
    const url = null

    expect(isUrl(url as unknown as string)).toEqual(false)
  })

  it('should return false when the URL is undefined', () => {
    const url = undefined

    expect(isUrl(url as unknown as string)).toEqual(false)
  })
})
