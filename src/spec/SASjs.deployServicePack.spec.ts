import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'
import { SASViyaApiClient } from '../SASViyaApiClient'
import { DeployProgress } from '../types'

const appLoc = '/Public/app'

const servicePack = () => ({
  members: [
    {
      name: 'services',
      type: 'folder',
      members: [
        {
          name: 'web',
          type: 'folder',
          members: [
            { name: 'asset1.js', type: 'file', code: 'a' },
            { name: 'asset2.js', type: 'file', code: 'b' }
          ]
        },
        { name: 'app.html', type: 'file', code: 'c' },
        { name: 'getdata', type: 'service', code: 'data _null_;run;' }
      ]
    },
    {
      name: 'users',
      type: 'folder',
      members: [{ name: 'create', type: 'service', code: 'data _null_;run;' }]
    }
  ]
})

describe('SASjs.deployServicePack', () => {
  let sasjs: SASjs
  let apiClient: SASViyaApiClient
  let writes: { kind: string; name: string }[]

  beforeEach(() => {
    ;(process as any).logger = new Logger(LogLevel.Off)

    sasjs = new SASjs({
      serverUrl: 'https://test.com',
      serverType: ServerType.SasViya,
      contextName: 'test context'
    })

    // deployServicePack reads the location from the client it already holds when
    // no serverUrl/appLoc is passed, so the stubbed client supplies the root.
    apiClient = new SASViyaApiClient(
      'https://test.com',
      appLoc,
      'test context',
      undefined as any
    )
    ;(sasjs as any).sasViyaApiClient = apiClient

    writes = []

    jest.spyOn(apiClient, 'createFolder').mockImplementation((name: string) => {
      writes.push({ kind: 'folder', name })
      // the walk turns the created folder's id into the parent URI for its
      // children, so a stub without one would silently disable that
      return Promise.resolve({ id: `folder-${name}` } as any)
    })
    jest.spyOn(apiClient, 'createFile').mockImplementation((name: string) => {
      writes.push({ kind: 'file', name })
      return Promise.resolve({} as any)
    })
    jest
      .spyOn(apiClient, 'createJobDefinition')
      .mockImplementation((name: string) => {
        writes.push({ kind: 'service', name })
        return Promise.resolve({} as any)
      })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('reports every member, in the order it writes them, with its folder and position', async () => {
    // A Viya deploy is one request per member, run in sequence with no output of
    // its own, so the position of each write is the only progress a caller can
    // report. The order is not asserted against the input: deployServicePack
    // sorts the first folder's members, so the contract is "the order it writes".
    const reported: DeployProgress[] = []

    await sasjs.deployServicePack(
      servicePack(),
      undefined,
      undefined,
      'token',
      false,
      (progress) => reported.push(progress)
    )

    expect(reported).toHaveLength(8)
    expect(reported.map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(reported.every((p) => p.total === 8)).toBe(true)

    // one report per write, and the same writes in the same order
    expect(reported.map((p) => ({ kind: p.type, name: p.name }))).toEqual(
      writes
    )

    const folderOf = Object.fromEntries(
      reported.map((p) => [p.name, p.parentFolder])
    )
    expect(folderOf).toEqual({
      services: appLoc,
      web: `${appLoc}/services`,
      'asset1.js': `${appLoc}/services/web`,
      'asset2.js': `${appLoc}/services/web`,
      'app.html': `${appLoc}/services`,
      getdata: `${appLoc}/services`,
      users: appLoc,
      create: `${appLoc}/users`
    })
  })

  it('deploys identically when no callback is supplied', async () => {
    await sasjs.deployServicePack(servicePack())

    expect(writes).toHaveLength(8)
    expect(writes.filter((w) => w.kind === 'folder')).toHaveLength(3)
    expect(writes.filter((w) => w.kind === 'file')).toHaveLength(3)
    expect(writes.filter((w) => w.kind === 'service')).toHaveLength(2)
  })

  it('hands each member the URI of its parent folder, so nothing looks the folder up twice', async () => {
    // one folder lookup per member is half the deploy's requests; the folder the
    // walk has just created gives its children a URI instead of a path to resolve
    const fileCalls: any[][] = []
    const jobCalls: any[][] = []

    ;(apiClient.createFile as jest.Mock).mockImplementation(
      (...args: any[]) => {
        fileCalls.push(args)
        return Promise.resolve({} as any)
      }
    )
    ;(apiClient.createJobDefinition as jest.Mock).mockImplementation(
      (...args: any[]) => {
        jobCalls.push(args)
        return Promise.resolve({} as any)
      }
    )

    await sasjs.deployServicePack(
      servicePack(),
      undefined,
      undefined,
      'token',
      false
    )

    const uriOf = (name: string) => `/folders/folders/folder-${name}`

    // (name, code, parentPath, parentUri, token, client)
    for (const [name, , parentPath, parentUri] of fileCalls) {
      expect(parentUri).toBe(uriOf(parentPath.split('/').pop() as string))
      expect(name).toBeTruthy()
    }
    for (const [name, , parentPath, parentUri] of jobCalls) {
      expect(parentUri).toBe(uriOf(parentPath.split('/').pop() as string))
      expect(name).toBeTruthy()
    }

    // the two top-level folders still resolve appLoc itself - the root has no
    // folder above it to inherit a URI from
    const folderCalls = (apiClient.createFolder as jest.Mock).mock.calls
    expect(
      folderCalls.filter(([, , parentUri]) => parentUri === undefined)
    ).toHaveLength(2)
  })

  it('does not announce a member it cannot identify', async () => {
    const tree = servicePack()
    ;(tree.members[1] as any).members.push({ name: 'bogus', type: 'sausage' })

    const reported: DeployProgress[] = []

    const error = await sasjs
      .deployServicePack(
        tree,
        undefined,
        undefined,
        'token',
        false,
        (progress) => reported.push(progress)
      )
      .catch((e: any) => e)

    expect(error.message).toEqual(`Unidentified member 'bogus' provided.`)
    // the eight identified members are reported as they are written; the ninth
    // throws before it is announced
    expect(reported).toHaveLength(8)
    expect(reported.map((p) => p.name)).not.toContain('bogus')
  })
})
