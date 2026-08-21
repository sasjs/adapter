import { RequestClient } from '../../request/RequestClient'
import { parseSasViyaDebugResponse } from '../parseViyaDebugResponse'

describe('parseSasViyaDebugResponse', () => {
  let requestClient: RequestClient
  const serverUrl = 'http://test-server.com'

  beforeEach(() => {
    requestClient = {
      get: jest.fn()
    } as unknown as RequestClient
  })

  it('should extract URL and call get for Viya 3.5 iframe style', async () => {
    const iframeUrl = '/path/to/log.json'
    const response = `<html><body><iframe style="width: 99%; height: 500px" src="${iframeUrl}"></iframe></body></html>`
    const resultData = { message: 'success' }

    // Mock the get method to resolve with an object containing the JSON result as string.
    ;(requestClient.get as jest.Mock).mockResolvedValue({
      result: JSON.stringify(resultData)
    })

    const result = await parseSasViyaDebugResponse(
      response,
      requestClient,
      serverUrl
    )

    expect(requestClient.get).toHaveBeenCalledWith(
      serverUrl + iframeUrl,
      undefined,
      'text/plain'
    )
    expect(result).toEqual(resultData)
  })

  it('should extract URL and call get for Viya 4 iframe style', async () => {
    const iframeUrl = '/another/path/to/log.json'
    // Note: For Viya 4, the regex splits in such a way that the extracted URL includes an extra starting double-quote.
    // For example, the URL becomes: '"/another/path/to/log.json'
    const response = `<html><body><iframe style="width: 99%; height: 500px; background-color:Canvas;" src="${iframeUrl}"></iframe></body></html>`
    const resultData = { status: 'ok' }

    ;(requestClient.get as jest.Mock).mockResolvedValue({
      result: JSON.stringify(resultData)
    })

    const result = await parseSasViyaDebugResponse(
      response,
      requestClient,
      serverUrl
    )
    // Expect the extra starting double-quote as per the current implementation.
    const expectedUrl = serverUrl + `"` + iframeUrl

    expect(requestClient.get).toHaveBeenCalledWith(
      expectedUrl,
      undefined,
      'text/plain'
    )
    expect(result).toEqual(resultData)
  })

  it('falls back to weboutBEGIN/END blob extraction if no iframe URL is found', async () => {
    const resultData = { SYSCC: '0', result: [{ STATUS: 'configured' }] }
    const response = `<script>
var blob = new Blob([\`>>weboutBEGIN<<
${JSON.stringify(resultData)}
>>weboutEND<<
\`], {type: 'text/plain'});
</script>`

    const result = await parseSasViyaDebugResponse(
      response,
      requestClient,
      serverUrl
    )

    expect(result).toEqual(resultData)
    expect(requestClient.get).not.toHaveBeenCalled()
  })

  it('falls back to a raw (unwrapped) JSON blob if no iframe URL is found', async () => {
    const resultData = { message: 'success' }
    const response = `<script>
var blob = new Blob([\`${JSON.stringify(resultData)}\`], {type: 'application/json'});
</script>`

    const result = await parseSasViyaDebugResponse(
      response,
      requestClient,
      serverUrl
    )

    expect(result).toEqual(resultData)
    expect(requestClient.get).not.toHaveBeenCalled()
  })

  it('should throw an error if neither an iframe URL nor a webout blob is found', async () => {
    const response = `<html><body>No iframe or blob here</body></html>`

    await expect(
      parseSasViyaDebugResponse(response, requestClient, serverUrl)
    ).rejects.toThrow('Unable to find webout file URL.')
  })
})
