import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'
import { SASViyaApiClient } from '../SASViyaApiClient'
import { RequestClient } from '../request/RequestClient'

// The deploy is request-bound: one lookup for the folder plus one write per
// member. This pins the lookup count against a real SASViyaApiClient, so a
// change that starts resolving folders by path again cannot pass.
describe('SASjs.deployServicePack request count', () => {
  const appLoc = '/Public/app'
  let sasjs: SASjs
  let requestClient: RequestClient
  let gets: string[]
  let counter: number

  const tree = () => ({
    members: [
      {
        name: 'services',
        type: 'folder',
        members: [
          {
            name: 'web',
            type: 'folder',
            members: [
              { name: 'main.js', type: 'file', code: 'a' },
              { name: 'index.html', type: 'file', code: 'b' }
            ]
          },
          { name: 'app.html', type: 'file', code: 'c' },
          { name: 'getdata', type: 'service', code: 'data _null_;run;' }
        ]
      },
      {
        name: 'jobs',
        type: 'folder',
        members: [
          { name: 'nightly', type: 'service', code: 'data _null_;run;' }
        ]
      }
    ]
  })

  beforeEach(async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    gets = []
    counter = 0

    sasjs = new SASjs({
      serverUrl: 'https://test.com',
      serverType: ServerType.SasViya,
      contextName: 'test context'
    })

    requestClient = new (<jest.Mock<RequestClient>>RequestClient)()
    ;(sasjs as any).sasViyaApiClient = new SASViyaApiClient(
      'https://test.com',
      appLoc,
      'test context',
      requestClient
    )
    jest
      .spyOn((sasjs as any).requestClient, 'forDeployment')
      .mockReturnValue(requestClient)

    jest.spyOn(requestClient, 'get').mockImplementation((url: string) => {
      gets.push(url)

      // the type catalogue, fetched once by the first file upload
      if (url.includes('/types/types'))
        return Promise.resolve({ result: { items: [] } } as any)

      return Promise.resolve({
        result: { id: `folder${++counter}`, memberCount: 0 }
      } as any)
    })

    jest.spyOn(requestClient, 'post').mockImplementation((url: string) => {
      if (url.startsWith('/folders/folders'))
        return Promise.resolve({
          result: { id: `created${++counter}`, links: [] }
        } as any)

      return Promise.resolve({
        status: 201,
        result: { id: 'written', links: [] }
      } as any)
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('looks up a folder once per top-level folder, not once per member', async () => {
    await sasjs.deployServicePack(tree(), undefined, undefined, 'token', false)

    const lookups = gets.filter((url) => url.includes('@item'))

    // services and jobs are written into appLoc, which neither of them inherits a
    // URI for - every member below them is handed its parent's URI instead
    expect(lookups).toHaveLength(2)
    expect(lookups.every((url) => url.endsWith(`@item?path=${appLoc}`))).toBe(
      true
    )
  })
})
