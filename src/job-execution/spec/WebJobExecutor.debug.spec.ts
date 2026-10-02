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

  it('parses the blob payload a live Viya server returns for _debug=128 with _EXECUTIONTASKS', async () => {
    // Captured from Viya 4: the webout sits in a script-constructed Blob inside
    // an iframe that has no src at all, so there is no URL for the iframe parser
    // to follow.
    const { executor, postSpy, requestClient } = makeExecutor()
    const getSpy = jest.spyOn(requestClient, 'get')
    const liveBlobHtml = `<!DOCTYPE html>
<html>
<title>SASJobExecution</title>
<body bgcolor="#FFFFFF" text="#000000" link="#0000FF" vlink="#800080" alink="#FF0000">
<div style="text-align:left;color:black;font-family: arial,sans-serif;font-size:medium" >
<iframe id="blobFrame" style="width:99%; height:500px; background-color:Canvas;"></iframe>
<script>
var blob = new Blob([\`>>weboutBEGIN<<
{"SYSDATE" : "02OCT26" ,"SYSTIME" : "10:46" ,"areas" : [ {"AREA":"Adak"} ] }
>>weboutEND<<
\`], {type: 'text/plain'});
</script>
</body>
</html>`
    postSpy.mockResolvedValue({ result: liveBlobHtml, etag: '' } as any)

    const response: any = await executor.execute(
      'services/common/appinit',
      null,
      {
        ...baseConfig,
        runAsTask: true,
        useComputeApi: undefined
      }
    )

    expect(response).toEqual({
      SYSDATE: '02OCT26',
      SYSTIME: '10:46',
      areas: [{ AREA: 'Adak' }]
    })
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('parses the iframe form a live Viya server returns, where the src is unquoted', async () => {
    // Captured from Viya 4 for _debug=131: the src attribute carries no quotes,
    // which is why the parser splits on both quoted and bare closers.
    const { executor, postSpy, requestClient } = makeExecutor()
    const liveIframeUrl =
      '/SASJobExecution/?_fileid=6ef951bf-f3c3-4d9a-ba93-f219618bde2f'
    const liveIframeHtml = `<!DOCTYPE html>
<html>
<title>SASJobExecution</title>
<body bgcolor="#FFFFFF" text="#000000" link="#0000FF" vlink="#800080" alink="#FF0000">
<div style="text-align:left;color:black;font-family: arial,sans-serif;font-size:medium" >
<iframe style="width: 99%; height: 500px; background-color:Canvas;" src=${liveIframeUrl}></iframe>
</body></html>`
    postSpy.mockResolvedValue({ result: liveIframeHtml, etag: '' } as any)
    const getSpy = jest
      .spyOn(requestClient, 'get')
      .mockResolvedValue({ result: JSON.stringify(resultData) } as any)

    const response: any = await executor.execute(
      'services/common/configure',
      null,
      baseConfig
    )

    expect(getSpy).toHaveBeenCalledWith(
      serverUrl + liveIframeUrl,
      undefined,
      'text/plain'
    )
    expect(response).toEqual(resultData)
  })

  it('reports the parser error, not the server message, when the task never completes', async () => {
    // A cold compute context answers with a 202 whose body is a plain-text task
    // error. It carries no webout, so parsing fails - and the message the caller
    // sees is the parser's, not the server's.
    const { executor, postSpy } = makeExecutor()
    postSpy.mockResolvedValue({
      result:
        'Job error The task 613d0808-7834-478a-8d4b-8448dbdb867e did not complete within the specified timeout of 5 seconds. path: /compute/tasks',
      etag: ''
    } as any)

    await expect(
      executor.execute('services/common/appinit', null, {
        ...baseConfig,
        runAsTask: true,
        useComputeApi: undefined
      })
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining('Unable to find webout content')
        })
      })
    )
  })
})
