import { SASViyaApiClient } from '../SASViyaApiClient'

const sampleResponse = `{
  "creationTimeStamp": "2021-01-06T14:09:27.705Z",
  "modifiedTimeStamp": "2021-01-06T14:46:57.391Z",
  "createdBy": "dctestuser1",
  "modifiedBy": "dctestuser1",
  "id": "00000-00000-00000-00000-00000",
  "name": "test",
  "parentFolderUri":"/folders/folders/00000-00000-00000-00000-00000",
  "type": "folder",
  "memberCount":"1"
}`

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

  beforeEach(() => {
    ;(global as any).fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        text: () => Promise.resolve(sampleResponse),
        json: () => Promise.resolve(sampleResponse),
        ok: true,
        headers: {
          get: function () {
            return ''
          }
        }
      })
    )
  })

  afterAll(() => {
    ;(global as any).fetch = originalFetch
  })

  it('should move folder successfully', async (done) => {
    let res: any = await sasViyaApiClient.moveFolder(
      '/Test/test',
      '/Test/toFolder',
      'toFolder',
      'token'
    )

    expect(JSON.stringify(res)).toEqual(JSON.stringify(sampleResponse))
    done()
  })
})
