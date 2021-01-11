import { SASViyaApiClient } from '../SASViyaApiClient'

describe('FolderOperations', () => {
  let originalFetch: any

  const sasViyaApiClient = new SASViyaApiClient(
    'https://sample.server.com',
    '/Public',
    'Context',
    function () {}
  )

  beforeAll(() => {
    originalFetch = (global as any).fetch
  })

  beforeEach(() => {})

  afterAll(() => {
    ;(global as any).fetch = originalFetch
  })

  it('should move and rename folder', async (done) => {
    mockFetchResponse(false)

    let res: any = await sasViyaApiClient.moveFolder(
      '/Test/fromFolder/oldName',
      '/Test/toFolder/newName',
      'newName',
      'token'
    )

    let jsonResponse = JSON.parse(res)

    expect(jsonResponse.name).toEqual('newName')
    expect(jsonResponse.parentFolderUri.split('=')[1]).toEqual('/Test/toFolder')

    done()
  })

  it('should move and keep the name of folder', async (done) => {
    mockFetchResponse(true)

    let res: any = await sasViyaApiClient.moveFolder(
      '/Test/fromFolder/oldName',
      '/Test/toFolder',
      'toFolder',
      'token'
    )

    let jsonResponse = JSON.parse(res)

    expect(jsonResponse.name).toEqual('oldName')
    expect(jsonResponse.parentFolderUri.split('=')[1]).toEqual('/Test/toFolder')

    done()
  })

  it('should only rename folder', async (done) => {
    mockFetchResponse(false)

    let res: any = await sasViyaApiClient.moveFolder(
      '/Test/toFolder/oldName',
      '/Test/toFolder/newName',
      'newName',
      'token'
    )

    let jsonResponse = JSON.parse(res)

    expect(jsonResponse.name).toEqual('newName')
    expect(jsonResponse.parentFolderUri.split('=')[1]).toEqual('/Test/toFolder')

    done()
  })
})

const mockFetchResponse = (targetFolderExists: boolean) => {
  ;(global as any).fetch = jest
    .fn()
    .mockImplementation((url: any, request: any) => {
      console.log(`[url]`, url)
      console.log(`[request]`, request)

      if (
        request.method === 'GET' &&
        !targetFolderExists &&
        url.includes('newName')
      ) {
        return Promise.resolve({
          text: () => Promise.resolve(undefined),
          json: () => Promise.resolve(undefined),
          ok: true,
          headers: {
            get: function () {
              return ''
            }
          }
        })
      }

      if (request.method === 'GET' && url.includes('/Test/toFolder')) {
        return Promise.resolve({
          text: () => Promise.resolve({ id: url }),
          json: () => Promise.resolve({ id: url }),
          ok: true,
          headers: {
            get: function () {
              return ''
            }
          }
        })
      }

      return Promise.resolve({
        text: () => Promise.resolve(request.body),
        json: () => Promise.resolve(request.body),
        ok: true,
        headers: {
          get: function () {
            return ''
          }
        }
      })
    })
}
