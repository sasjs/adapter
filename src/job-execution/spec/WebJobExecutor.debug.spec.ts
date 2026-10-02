import { ServerType } from '@sasjs/utils/types'
import { WebJobExecutor } from '../WebJobExecutor'
import { RequestClient } from '../../request/RequestClient'
import { SASViyaApiClient } from '../../SASViyaApiClient'

describe('WebJobExecutor debug response parsing', () => {
  const serverUrl = 'https://sample.server.com'
  const jobsPath = '/SASJobExecution'

  const makeExecutor = (serverType: ServerType = ServerType.SasViya) => {
    const requestClient = new RequestClient(serverUrl)
    const sasViyaApiClient = {
      getJobsInFolder: async () => []
    } as unknown as SASViyaApiClient
    const executor = new WebJobExecutor(
      serverUrl,
      serverType,
      jobsPath,
      requestClient,
      sasViyaApiClient
    )
    const postSpy = jest.spyOn(requestClient, 'post')
    jest.spyOn(requestClient, 'appendRequest').mockImplementation()
    return { executor, postSpy, requestClient }
  }

  const baseConfig = {
    serverUrl,
    serverType: ServerType.SasViya,
    appLoc: '/Public/app',
    debug: true,
    runAsTask: true
  }

  const resultData = {
    SYSDATE: '18AUG26',
    result: [{ STATUS: 'configured' }]
  }

  // The _debug=128 response shape: a JES web app page whose webout content is
  // inlined into a script-constructed Blob, wrapped in weboutBEGIN/END
  // markers.
  const debug128Html = `<!DOCTYPE html>
<html>
<title>SASJobExecution</title>
<body>
<iframe id="blobFrame"></iframe>
<script>
var blob = new Blob([\`>>weboutBEGIN<<
${JSON.stringify(resultData)}
>>weboutEND<<
\`], {type: 'text/plain'});
</script>
</body>
</html>`

  // The iframe-URL response shape: the webout is a file the caller fetches
  // separately.
  const iframeUrl = '/path/to/log.json'
  const iframeHtml = `<html><body><iframe style="width: 99%; height: 500px" src="${iframeUrl}"></iframe></body></html>`

  it('parses a successful response when debug + runAsTask=true and useComputeApi is undefined', async () => {
    const { executor, postSpy } = makeExecutor()
    postSpy.mockResolvedValue({ result: debug128Html, etag: '' } as any)

    const response: any = await executor.execute(
      'services/common/configure',
      null,
      {
        ...baseConfig,
        useComputeApi: undefined
      }
    )

    expect(response).toEqual(resultData)
  })

  it('parses a successful response when debug + runAsTask=true and useComputeApi is explicitly null', async () => {
    const { executor, postSpy } = makeExecutor()
    postSpy.mockResolvedValue({ result: debug128Html, etag: '' } as any)

    const response: any = await executor.execute(
      'services/common/configure',
      null,
      {
        ...baseConfig,
        useComputeApi: null
      }
    )

    expect(response).toEqual(resultData)
  })

  it('still routes the non-runAsTask (_debug=131) path through the iframe-URL parser', async () => {
    const { executor, postSpy, requestClient } = makeExecutor()
    postSpy.mockResolvedValue({ result: iframeHtml, etag: '' } as any)
    const getSpy = jest
      .spyOn(requestClient, 'get')
      .mockResolvedValue({ result: JSON.stringify(resultData) } as any)

    const response: any = await executor.execute(
      'services/common/configure',
      null,
      {
        ...baseConfig,
        runAsTask: false,
        useComputeApi: undefined
      }
    )

    expect(getSpy).toHaveBeenCalledWith(
      serverUrl + iframeUrl,
      undefined,
      'text/plain'
    )
    expect(response).toEqual(resultData)
  })

  it('routes on the response shape, so an iframe-URL response is parsed as one whatever _debug value was sent', async () => {
    // Simulates a future revert of the _debug=128 workaround (added for a
    // SAS platform bug) back to _debug=131 while runAsTask stays true. The
    // parser follows the response, not the _debug value, so this can't
    // silently break again if that mapping changes.
    const { executor, postSpy, requestClient } = makeExecutor()
    jest
      .spyOn(executor as any, 'getRequestParams')
      .mockReturnValue({ _debug: 131, _omitSessionResults: 'false' })
    postSpy.mockResolvedValue({ result: iframeHtml, etag: '' } as any)
    const getSpy = jest
      .spyOn(requestClient, 'get')
      .mockResolvedValue({ result: JSON.stringify(resultData) } as any)

    const response: any = await executor.execute(
      'services/common/configure',
      null,
      {
        ...baseConfig,
        runAsTask: true, // still true - only the resulting _debug value changed
        useComputeApi: undefined
      }
    )

    expect(getSpy).toHaveBeenCalledWith(
      serverUrl + iframeUrl,
      undefined,
      'text/plain'
    )
    expect(response).toEqual(resultData)
  })

  it('parses the iframe form even when the request sent _debug=128', async () => {
    // Observed on Viya 4: a _debug=128 request without _EXECUTIONTASKS comes
    // back in the iframe form rather than as an inline blob, so the value sent
    // cannot be used to pick the parser.
    const { executor, postSpy, requestClient } = makeExecutor()
    jest
      .spyOn(executor as any, 'getRequestParams')
      .mockReturnValue({ _debug: 128, _omitSessionResults: 'false' })
    postSpy.mockResolvedValue({ result: iframeHtml, etag: '' } as any)
    const getSpy = jest
      .spyOn(requestClient, 'get')
      .mockResolvedValue({ result: JSON.stringify(resultData) } as any)

    const response: any = await executor.execute(
      'services/common/configure',
      null,
      {
        ...baseConfig,
        runAsTask: true,
        useComputeApi: undefined
      }
    )

    expect(getSpy).toHaveBeenCalledWith(
      serverUrl + iframeUrl,
      undefined,
      'text/plain'
    )
    expect(response).toEqual(resultData)
  })
})
