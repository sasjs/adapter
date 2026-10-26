import { AxiosRequestHeaders, AxiosResponse } from 'axios'
import { Sas9RequestClient } from '../Sas9RequestClient'
import { UnsafeRedirectError } from '../../types/errors'

describe('Sas9RequestClient', () => {
  const baseUrl = 'https://sas.example.com'
  const accessToken = 'access-token'
  const etag = 'etag'

  let client: Sas9RequestClient
  let getSpy: jest.SpyInstance
  let postSpy: jest.SpyInstance
  let warnSpy: jest.SpyInstance

  /**
   * The 302 is what this spec is about: `maxRedirects` is 0, so axios returns
   * it rather than following it, and the client follows it itself.
   */
  const response = (
    status: number,
    data: any = {},
    location?: string
  ): AxiosResponse => ({
    data,
    status,
    statusText: status === 302 ? 'Found' : 'OK',
    headers: location === undefined ? { etag } : { etag, location },
    config: { headers: {} as AxiosRequestHeaders }
  })

  beforeEach(() => {
    client = new Sas9RequestClient(baseUrl)
    getSpy = jest.spyOn(client['httpClient'], 'get')
    postSpy = jest.spyOn(client['httpClient'], 'post')
    // getLogger() falls back to the console when no logger is attached to the
    // process, which is the case here.
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('redirects', () => {
    it('should follow a same-origin absolute Location, keeping the token', async () => {
      getSpy
        .mockResolvedValueOnce(
          response(302, '', `${baseUrl}/SASStoredProcess/do`)
        )
        .mockResolvedValueOnce(response(200, { ok: true }))

      const result = await client.get('/SASStoredProcess/do', accessToken)

      expect(getSpy).toHaveBeenCalledTimes(2)
      expect(getSpy.mock.calls[1][0]).toBe(`${baseUrl}/SASStoredProcess/do`)
      expect(getSpy.mock.calls[1][1].headers.Authorization).toBe(
        `Bearer ${accessToken}`
      )
      expect(result.result).toEqual({ ok: true })
    })

    it('should follow a relative Location', async () => {
      getSpy
        .mockResolvedValueOnce(response(302, '', 'do'))
        .mockResolvedValueOnce(response(200, { ok: true }))

      await client.get('/SASStoredProcess/do', accessToken)

      expect(getSpy).toHaveBeenCalledTimes(2)
      expect(getSpy.mock.calls[1][0]).toBe('do')
    })

    it('should refuse a Location on another origin, and never request it', async () => {
      getSpy.mockResolvedValueOnce(
        response(302, '', 'https://evil.example.com/steal')
      )

      await expect(
        client.get('/SASStoredProcess/do', accessToken)
      ).rejects.toThrow(UnsafeRedirectError)

      expect(getSpy).toHaveBeenCalledTimes(1)
    })

    it('should name the offending origin in the refusal', async () => {
      getSpy.mockResolvedValueOnce(
        response(302, '', 'https://evil.example.com/steal')
      )

      await expect(
        client.get('/SASStoredProcess/do', accessToken)
      ).rejects.toThrow(
        'https://evil.example.com is not the origin of the request'
      )
    })

    it('should refuse a protocol-relative Location that leaves the origin', async () => {
      getSpy.mockResolvedValueOnce(
        response(302, '', '//evil.example.com/steal')
      )

      await expect(
        client.get('/SASStoredProcess/do', accessToken)
      ).rejects.toThrow(UnsafeRedirectError)

      expect(getSpy).toHaveBeenCalledTimes(1)
    })

    it('should refuse a redirect that carries no Location', async () => {
      getSpy.mockResolvedValueOnce(response(302))

      await expect(
        client.get('/SASStoredProcess/do', accessToken)
      ).rejects.toThrow(UnsafeRedirectError)

      expect(getSpy).toHaveBeenCalledTimes(1)
    })

    it('should apply the same guard to a redirect after a post', async () => {
      postSpy.mockResolvedValueOnce(
        response(302, '', 'https://evil.example.com/steal')
      )

      await expect(
        client.post('/SASStoredProcess/do', {}, accessToken)
      ).rejects.toThrow(UnsafeRedirectError)

      expect(getSpy).not.toHaveBeenCalled()
    })

    it('should follow a same-origin redirect after a post', async () => {
      postSpy.mockResolvedValueOnce(
        response(302, '', `${baseUrl}/SASStoredProcess/do`)
      )
      getSpy.mockResolvedValueOnce(response(200, { ok: true }))

      await client.post('/SASStoredProcess/do', {}, accessToken)

      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(getSpy.mock.calls[0][0]).toBe(`${baseUrl}/SASStoredProcess/do`)
    })
  })

  describe('deprecated SAS 9 username / password login', () => {
    // The warning is once per process, so these run in order: the first proves
    // the flag starts clear, the second that it fires, the third that it does
    // not fire again.
    const deprecationWarnings = () =>
      warnSpy.mock.calls.filter((call) =>
        String(call[0]).includes('SAS 9 username / password login')
      )

    it('should not warn when no credentials are supplied', async () => {
      getSpy.mockResolvedValueOnce(response(200, ''))

      await client.login(
        undefined as unknown as string,
        undefined as unknown as string,
        '/SASStoredProcess/do'
      )

      expect(deprecationWarnings()).toHaveLength(0)
    })

    it('should warn once when credentials are supplied', async () => {
      getSpy.mockResolvedValueOnce(response(200, ''))

      await client.login('user', 'password', '/SASStoredProcess/do')

      expect(deprecationWarnings()).toHaveLength(1)
    })

    it('should not warn again for a later call in the same process', async () => {
      getSpy.mockResolvedValueOnce(response(200, ''))

      await client.login('user', 'password', '/SASStoredProcess/do')

      expect(deprecationWarnings()).toHaveLength(0)
    })
  })
})
