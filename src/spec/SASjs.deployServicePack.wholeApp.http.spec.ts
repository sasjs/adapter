import * as http from 'http'
import { AddressInfo } from 'net'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'

jest.unmock('axios')

const rootId = '11111111-1111-4111-8111-111111111111'
const parentId = '22222222-2222-4222-8222-222222222222'
const binId = '33333333-3333-4333-8333-333333333333'
const newId = '44444444-4444-4444-8444-444444444444'
const nestedId = '55555555-5555-4555-8555-555555555555'

describe('forced whole-app deployment over HTTP', () => {
  let server: http.Server
  let origin: string
  let present: boolean
  let oldContents: string[]
  let newContents: string[]
  let events: string[]
  let appStatus: number
  let fileStatus: number
  let recycleStatus: number
  let rootEtag: string | undefined
  let folderStatus: number
  let collision: boolean
  let jobStatus: number
  let csrfChallenge: boolean
  let repeatedMoveDenial: boolean
  let noMoveChallenge: boolean
  let hostileChallenge: boolean
  let patchConditions: string[]
  let fileBodies: string[]
  let fileHeaders: string[]
  let fileDispositions: string[]
  let fileCsrf: boolean
  let listCount: number | undefined
  let omitListCount: boolean
  let omitCountAfterMove: boolean
  let hideMoved: boolean
  let moveBodies: any[]
  let targetOverrides: any
  let movedOverrides: any
  let targetName: string
  let parentPath: string
  let binOverrides: any
  let listStatus: number
  let fullPageCount: boolean
  let exactFullPage: boolean
  let parentOverrides: any
  let metadataPatch: boolean
  let fileIdentity: string
  let filePatchUri: string
  let omitFilePatchLink: boolean
  let fileEtag: string | undefined
  let metadataStatus: number
  let metadataConditions: string[]
  let rootCreateOverrides: any
  let nestedCreateOverrides: any
  let typesStatus: number

  beforeEach(async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    present = true
    oldContents = ['asset.txt:old', 'unrelated:keep only in recycle bin']
    newContents = []
    events = []
    appStatus = 200
    fileStatus = 201
    folderStatus = 201
    collision = false
    jobStatus = 201
    csrfChallenge = false
    repeatedMoveDenial = false
    noMoveChallenge = false
    hostileChallenge = false
    patchConditions = []
    fileBodies = []
    fileHeaders = []
    fileDispositions = []
    fileCsrf = false
    listCount = undefined
    omitListCount = false
    omitCountAfterMove = false
    hideMoved = false
    moveBodies = []
    targetOverrides = {}
    movedOverrides = {}
    targetName = 'app'
    parentPath = '/Public'
    binOverrides = {}
    listStatus = 200
    fullPageCount = false
    exactFullPage = false
    parentOverrides = {}
    metadataPatch = false
    fileIdentity = nestedId
    filePatchUri = `/files/files/${nestedId}`
    omitFilePatchLink = false
    fileEtag = '"file-v1"'
    metadataStatus = 200
    metadataConditions = []
    rootCreateOverrides = {}
    nestedCreateOverrides = {}
    typesStatus = 200
    recycleStatus = 200
    rootEtag = '"root-v1"'
    let recycled = false
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        const url = new URL(req.url!, 'http://localhost')
        const body = Buffer.concat(chunks).toString()
        res.setHeader('Content-Type', 'application/json')
        events.push(`${req.method} ${url.pathname}${url.search}`)
        if (url.pathname === '/folders/folders/@item') {
          const path = url.searchParams.get('path')
          if (path === `${parentPath}/${targetName}` && appStatus !== 200) {
            res.statusCode = appStatus
            return res.end(
              JSON.stringify({
                id: rootId,
                name: targetName,
                type: 'folder',
                parentFolderUri: `/folders/folders/${parentId}`
              })
            )
          }
          if (path === `${parentPath}/${targetName}` && present) {
            if (rootEtag) res.setHeader('ETag', rootEtag)
            return res.end(
              JSON.stringify({
                id: recycled ? newId : rootId,
                name: targetName,
                type: 'folder',
                description: 'preserve me',
                version: 1,
                parentFolderUri: `/folders/folders/${parentId}`,
                ...targetOverrides
              })
            )
          }
          if (path === parentPath)
            return res.end(
              JSON.stringify({
                id: parentId,
                name: parentPath.split('/').pop(),
                type: 'folder',
                ...parentOverrides
              })
            )
          res.statusCode = 404
          return res.end('{}')
        }
        if (url.pathname === '/folders/folders/@myRecycleBin') {
          res.statusCode = recycleStatus
          return res.end(
            JSON.stringify({ id: binId, type: 'trashFolder', ...binOverrides })
          )
        }
        if (
          url.pathname === `/folders/folders/${rootId}/members` ||
          url.pathname === `/folders/folders/${newId}/members`
        ) {
          return res.end(
            JSON.stringify({
              items: [
                { name: url.pathname.includes(rootId) ? 'old-job' : 'new-job' }
              ]
            })
          )
        }
        if (url.pathname === `/folders/folders/${binId}/members`) {
          res.statusCode = listStatus
          if (fullPageCount || exactFullPage) {
            const start = Number(url.searchParams.get('start'))
            return res.end(
              JSON.stringify({
                count: 100,
                items:
                  start === 0
                    ? Array.from({ length: 100 }, (_, i) =>
                        recycled && i === 99
                          ? { name: rootId, uri: `/folders/folders/${rootId}` }
                          : { name: `member-${i}`, uri: `/dummy/${i}` }
                      )
                    : exactFullPage
                      ? []
                      : [{ name: rootId, uri: '/other' }]
              })
            )
          }
          return res.end(
            JSON.stringify({
              items: collision
                ? [{ name: rootId, uri: '/other' }]
                : recycled && !hideMoved
                  ? [
                      {
                        name: rootId,
                        uri: `/folders/folders/${rootId}`
                      }
                    ]
                  : [],
              ...(!omitListCount &&
                !(recycled && omitCountAfterMove) && {
                  count:
                    listCount ?? (collision || (recycled && !hideMoved) ? 1 : 0)
                })
            })
          )
        }
        if (
          req.method === 'PUT' &&
          url.pathname === `/folders/folders/${rootId}`
        ) {
          patchConditions.push(String(req.headers['if-match'] || ''))
          if (hostileChallenge && patchConditions.length === 1) {
            res.statusCode = 403
            res.setHeader('x-csrf-header', 'if-match')
            res.setHeader('if-match', '*')
            return res.end('{}')
          }
          if (noMoveChallenge) {
            res.statusCode = 403
            return res.end('{}')
          }
          if (repeatedMoveDenial && patchConditions.length <= 4) {
            res.statusCode = 403
            if (patchConditions.length === 1) {
              res.setHeader('x-csrf-header', 'x-test-csrf')
              res.setHeader('x-test-csrf', 'csrf')
            }
            return res.end('{}')
          }
          if (csrfChallenge && !req.headers['x-test-csrf']) {
            res.statusCode = 403
            res.setHeader('x-csrf-header', 'x-test-csrf')
            res.setHeader('x-test-csrf', 'csrf')
            return res.end('{}')
          }
          const patch = JSON.parse(body)
          moveBodies.push(patch)
          if (patch.parentFolderUri !== `/folders/folders/${binId}`) {
            res.statusCode = 400
            return res.end('{}')
          }
          present = false
          recycled = true
          return res.end(
            JSON.stringify({
              id: rootId,
              name: patch.name,
              type: 'folder',
              parentFolderUri: patch.parentFolderUri,
              ...movedOverrides
            })
          )
        }
        if (req.method === 'POST' && url.pathname === '/folders/folders') {
          if (
            url.searchParams.get('parentFolderUri') ===
            `/folders/folders/${newId}`
          ) {
            res.statusCode = 201
            return res.end(
              JSON.stringify({
                id: nestedId,
                name: JSON.parse(body).name,
                type: 'folder',
                parentFolderUri: `/folders/folders/${newId}`,
                ...nestedCreateOverrides
              })
            )
          }
          if (
            url.searchParams.get('parentFolderUri') !==
              `/folders/folders/${parentId}` ||
            present
          ) {
            res.statusCode = 409
            return res.end('{}')
          }
          present = true
          res.statusCode = folderStatus
          return res.end(
            JSON.stringify({
              id: newId,
              name: JSON.parse(body).name,
              type: 'folder',
              parentFolderUri: `/folders/folders/${parentId}`,
              links: [],
              ...rootCreateOverrides
            })
          )
        }
        if (url.pathname === '/jobDefinitions/definitions') {
          res.statusCode = jobStatus
          return res.end('{}')
        }
        if (url.pathname === '/types/types') {
          res.statusCode = typesStatus
          return res.end(
            JSON.stringify({
              items: metadataPatch
                ? [
                    {
                      extensions: ['txt'],
                      name: 'text',
                      properties: { test: 'value' }
                    }
                  ]
                : []
            })
          )
        }
        if (req.method === 'PATCH') {
          metadataConditions.push(String(req.headers['if-match'] || ''))
          res.statusCode = metadataStatus
          return res.end('{}')
        }
        if (req.method === 'POST' && url.pathname === '/files/files') {
          fileBodies.push(body)
          fileHeaders.push(String(req.headers['content-type']))
          fileDispositions.push(String(req.headers['content-disposition']))
          if (fileCsrf && !req.headers['x-test-csrf']) {
            res.statusCode = 403
            res.setHeader('x-csrf-header', 'x-test-csrf')
            res.setHeader('x-test-csrf', 'csrf')
            return res.end('{}')
          }
          if (
            ![
              `/folders/folders/${newId}`,
              `/folders/folders/${nestedId}`
            ].includes(url.searchParams.get('parentFolderUri') || '')
          ) {
            res.statusCode = 409
            return res.end('{}')
          }
          newContents.push(body)
          res.statusCode = fileStatus
          if (fileEtag) res.setHeader('ETag', fileEtag)
          return res.end(
            JSON.stringify({
              id: fileIdentity,
              links: omitFilePatchLink
                ? []
                : [{ method: 'PATCH', rel: 'patch', uri: filePatchUri }]
            })
          )
        }
        res.statusCode = 500
        res.end('{}')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve()))
    )
  })

  it.each([
    '/',
    '/Public',
    '/Users',
    '/Users/name',
    '/users/NAME',
    '/Users/name/users/app',
    '/Users/name/../app',
    '/Users/name/%2e%2e/app',
    '/home/user/app',
    '/Public/../app',
    '/Public/%2e%2e/app',
    '/Public/app?x=1',
    '/Public//app',
    '/Public/app/',
    '/Public\\app'
  ])('rejects unsafe target %s before network access', async (path) => {
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: path
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events).toEqual([])
  })

  it.each(['folder', 'myFolder', 'userFolder'])(
    'replaces the reported home child with a %s parent',
    async (parentType) => {
      parentPath = '/Users/viyademo18'
      targetName = 'dc'
      parentOverrides = { type: parentType }
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Users/viyademo18/dc'
      })
      await sasjs.deployServicePack(
        {
          members: [
            { type: 'file', name: 'asset.txt', code: Buffer.from('new') }
          ]
        },
        undefined,
        undefined,
        'token',
        true
      )
      expect(
        events.filter((e) => e.startsWith('PUT /folders/folders/'))
      ).toEqual([`PUT /folders/folders/${rootId}`])
      expect(moveBodies[0].parentFolderUri).toBe(`/folders/folders/${binId}`)
      expect(
        events.filter((e) => e.startsWith('POST /folders/folders?'))
      ).toHaveLength(1)
      expect(newContents).toHaveLength(1)
      expect(newContents[0]).toContain('new')
    }
  )

  it('replaces an app inside the personal My Folder', async () => {
    parentPath = '/Users/alice/My Folder'
    parentOverrides = { type: 'myFolder' }
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: `${parentPath}/app`
    })
    await sasjs.deployServicePack(
      { members: [] },
      undefined,
      undefined,
      'token',
      true
    )
    expect(moveBodies[0].parentFolderUri).toBe(`/folders/folders/${binId}`)
  })

  it('does not replace the personal My Folder itself', async () => {
    parentPath = '/Users/alice'
    targetName = 'My Folder'
    parentOverrides = { type: 'userFolder' }
    targetOverrides = { type: 'myFolder' }
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: `${parentPath}/${targetName}`
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events.some((e) => /^(PUT|PATCH|POST|DELETE) /.test(e))).toBe(false)
  })

  it('rejects the personal folder path even if the folder is absent', async () => {
    present = false
    parentPath = '/Users/alice'
    targetName = 'My Folder'
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: `${parentPath}/${targetName}`
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events).toEqual([])
  })

  it('replaces an app deeper under a user home', async () => {
    parentPath = '/Users/viyademo18/projects'
    targetName = 'dc'
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Users/viyademo18/projects/dc'
    })
    await sasjs.deployServicePack(
      { members: [] },
      undefined,
      undefined,
      'token',
      true
    )
    expect(events.filter((e) => e.startsWith('PUT /folders/folders/'))).toEqual(
      [`PUT /folders/folders/${rootId}`]
    )
    expect(
      events.filter((e) => e.startsWith('POST /folders/folders?'))
    ).toHaveLength(1)
  })

  it('does not recycle a special home child', async () => {
    parentPath = '/Users/viyademo18'
    targetName = 'dc'
    parentOverrides = { type: 'myFolder' }
    targetOverrides = { type: 'myFolder' }
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Users/viyademo18/dc'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/deployment folder/i)
    expect(events.some((e) => /^(PUT|PATCH|POST|DELETE) /.test(e))).toBe(false)
  })

  it('creates an absent home child without moving the home', async () => {
    parentPath = '/Users/viyademo18'
    targetName = 'dc'
    parentOverrides = { type: 'myFolder' }
    present = false
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Users/viyademo18/dc'
    })
    await sasjs.deployServicePack(
      { members: [] },
      undefined,
      undefined,
      'token',
      true
    )
    expect(events.some((e) => e.startsWith('PUT '))).toBe(false)
    expect(
      events.filter((e) => e.startsWith('POST /folders/folders?'))
    ).toHaveLength(1)
  })

  it('rejects a trash folder as a user home parent before mutation', async () => {
    parentPath = '/Users/viyademo18'
    targetName = 'dc'
    parentOverrides = { type: 'trashFolder' }
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Users/viyademo18/dc'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/parent folder/i)
    expect(events.some((e) => /^(PUT|PATCH|POST|DELETE) /.test(e))).toBe(false)
  })

  it('rejects an explicitly empty appLoc override before network', async () => {
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack({ members: [] }, '', undefined, 'token', true)
    ).rejects.toThrow()
    expect(events).toEqual([])
  })

  it('rejects an overlong service name before any request', async () => {
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [{ type: 'service', name: 'x'.repeat(101), code: '' }] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/service.*name/i)
    expect(events).toEqual([])
  })

  it('rejects an invalid later member before moving anything', async () => {
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        {
          members: [
            { type: 'file', name: 'ok.txt', code: Buffer.from('ok') },
            { type: 'folder', name: '..', members: [] }
          ]
        },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events).toEqual([])
  })

  it.each([401, 403, 400, 502])(
    'fails closed when app lookup returns %s',
    async (status) => {
      appStatus = status
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public/app'
      })
      await expect(
        sasjs.deployServicePack(
          { members: [] },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow()
      expect(
        events.some((e) => e.startsWith('PUT ') || e.startsWith('POST '))
      ).toBe(false)
    }
  )

  it.each([
    { parentFolderUri: `/folders/folders/${binId}` },
    { parentFolderUri: null },
    { type: 'myFolder' },
    { type: 'userFolder' },
    { type: 'trashFolder' },
    { type: undefined },
    { id: 123 },
    { name: 'other' }
  ])('fails closed for invalid target identity %#', async (overrides) => {
    targetOverrides = overrides
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events.some((e) => /^(PUT|PATCH|POST|DELETE) /.test(e))).toBe(false)
  })

  it.each([
    { parentFolderUri: `/folders/folders/${parentId}` },
    { name: 'wrong' },
    { type: 'myFolder' }
  ])(
    'refuses recreation when moved response mismatches %#',
    async (overrides) => {
      movedOverrides = overrides
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public/app'
      })
      await expect(
        sasjs.deployServicePack(
          { members: [] },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow(/outcome unknown/i)
      expect(events.some((e) => e.startsWith('POST '))).toBe(false)
    }
  )

  it('fails closed on an omitted optional recycle count before mutation', async () => {
    omitListCount = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/listing/i)
    expect(
      events.some((event) => /^(PUT|POST|PATCH|DELETE) /.test(event))
    ).toBe(false)
  })

  it('reports recovery identities if the recycle count disappears after moving', async () => {
    omitCountAfterMove = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(
      new RegExp(`could not be verified.*${rootId}.*${binId}`, 'i')
    )
    expect(present).toBe(false)
    expect(moveBodies).toHaveLength(1)
    expect(events.some((event) => event.startsWith('POST '))).toBe(false)
  })

  it('accepts a full final page only after confirming the next page is empty', async () => {
    exactFullPage = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await sasjs.deployServicePack(
      { members: [] },
      undefined,
      undefined,
      'token',
      true
    )
    expect(
      events.filter((e) => e.includes('/members?limit=100&start=100'))
    ).toHaveLength(2)
  })

  it('does not treat a full page count as a complete listing', async () => {
    fullPageCount = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events.some((e) => /^(PUT|PATCH|POST|DELETE) /.test(e))).toBe(false)
  })

  it('rejects a special parent folder even when appLoc is absent', async () => {
    present = false
    parentOverrides = { type: 'myFolder' }
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events.some((e) => /^(PUT|PATCH|POST|DELETE) /.test(e))).toBe(false)
  })

  it('rejects a recycle delegate with the wrong type before mutation', async () => {
    binOverrides = { type: 'folder' }
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events.some((e) => /^(PUT|PATCH|POST|DELETE) /.test(e))).toBe(false)
  })

  it('rejects an HTTP 400 recycle listing even when its body looks valid', async () => {
    listStatus = 400
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events.some((e) => /^(PUT|PATCH|POST|DELETE) /.test(e))).toBe(false)
  })

  it('uses a bounded recycle name for long application names', async () => {
    targetName = 'x'.repeat(240)
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: `/Public/${targetName}`
    })
    await sasjs.deployServicePack(
      { members: [] },
      undefined,
      undefined,
      'token',
      true
    )
    expect(moveBodies[0].name).toBe(rootId)
  })

  it.each(['W/"root"', '"bad\tvalue"', '""'])(
    'rejects unsafe ETag %s before moving',
    async (etag) => {
      rootEtag = etag
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public/app'
      })
      await expect(
        sasjs.deployServicePack(
          { members: [] },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow()
      expect(events.some((e) => /^(PUT|PATCH|POST|DELETE) /.test(e))).toBe(
        false
      )
    }
  )

  it('rejects missing ETag before moving', async () => {
    rootEtag = undefined
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events.some((e) => e.startsWith('PUT '))).toBe(false)
  })

  it.each([400, 502])(
    'rejects type registry HTTP %s before file POST',
    async (status) => {
      typesStatus = status
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public/app'
      })
      await expect(
        sasjs.deployServicePack(
          { members: [{ type: 'file', name: 'asset.txt', code: 'hello' }] },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow(/partial/)
      expect(events.some((e) => e.startsWith('POST /files/files'))).toBe(false)
    }
  )

  it.each([400, 502])(
    'reports partial deployment when file creation returns %s',
    async (status) => {
      fileStatus = status
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public/app'
      })
      await expect(
        sasjs.deployServicePack(
          {
            members: [
              { type: 'file', name: 'asset.txt', code: Buffer.from('new') }
            ]
          },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow(/partial.*11111111/)
    }
  )

  it.each(['folder', 'file', 'service'])(
    'rejects undocumented 202 %s creation without continuing',
    async (kind) => {
      if (kind === 'folder') folderStatus = 202
      if (kind === 'file') fileStatus = 202
      if (kind === 'service') jobStatus = 202
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public/app'
      })
      await expect(
        sasjs.deployServicePack(
          {
            members: [
              {
                type: kind === 'service' ? 'service' : 'file',
                name: 'first',
                code: 'code'
              },
              { type: 'service', name: 'later', code: 'code' }
            ]
          },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow(/partial/)
      const jobs = events.filter((event) =>
        event.startsWith('POST /jobDefinitions/')
      )
      expect(jobs.length).toBe(kind === 'service' ? 1 : 0)
    }
  )

  it('rejects non-success job creation after recycling', async () => {
    jobStatus = 400
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        {
          members: [{ type: 'service', name: 'job', code: 'data _null_; run;' }]
        },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/partial/)
  })

  it('invalidates the original job cache after forced replacement', async () => {
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    const api = (sasjs as any).sasViyaApiClient
    expect(await api.getJobsInFolder('/Public/app')).toEqual([
      { name: 'old-job' }
    ])
    await sasjs.deployServicePack(
      { members: [] },
      undefined,
      undefined,
      'token',
      true
    )
    expect(await api.getJobsInFolder('/Public/app')).toEqual([
      { name: 'new-job' }
    ])
  })

  it('invalidates cached jobs after a partial recreation failure', async () => {
    fileStatus = 400
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    const api = (sasjs as any).sasViyaApiClient
    expect(await api.getJobsInFolder('/Public/app')).toEqual([
      { name: 'old-job' }
    ])
    await expect(
      sasjs.deployServicePack(
        {
          members: [
            { type: 'file', name: 'asset.txt', code: Buffer.from('new') }
          ]
        },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/partial/)
    expect(await api.getJobsInFolder('/Public/app')).toEqual([
      { name: 'new-job' }
    ])
  })

  it('invalidates cached jobs when recycle move outcome is uncertain', async () => {
    movedOverrides = { name: 'wrong' }
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    const api = (sasjs as any).sasViyaApiClient
    expect(await api.getJobsInFolder('/Public/app')).toEqual([
      { name: 'old-job' }
    ])
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/outcome unknown/)
    await expect(api.getJobsInFolder('/Public/app')).rejects.toThrow()
  })

  it('refuses metadata patch links pointing at another same-origin resource', async () => {
    metadataPatch = true
    filePatchUri = `/folders/folders/${parentId}`
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        {
          members: [
            { type: 'file', name: 'asset.txt', code: Buffer.from('new') }
          ]
        },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(metadataConditions).toEqual([])
  })

  it('patches only the created file using its strong ETag', async () => {
    metadataPatch = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await sasjs.deployServicePack(
      {
        members: [{ type: 'file', name: 'asset.txt', code: Buffer.from('new') }]
      },
      undefined,
      undefined,
      'token',
      true
    )
    expect(metadataConditions).toEqual(['"file-v1"'])
    expect(events).toContain(`PATCH /files/files/${nestedId}`)
  })

  it.each([undefined, '*', 'W/"weak"', '""'])(
    'refuses metadata PATCH with unsafe create ETag %s',
    async (etag) => {
      metadataPatch = true
      fileEtag = etag
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public/app'
      })
      await expect(
        sasjs.deployServicePack(
          {
            members: [
              { type: 'file', name: 'asset.txt', code: Buffer.from('new') }
            ]
          },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow()
      expect(metadataConditions).toEqual([])
    }
  )

  it.each([400, 502])('rejects metadata PATCH HTTP %s', async (status) => {
    metadataPatch = true
    metadataStatus = status
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        {
          members: [
            { type: 'file', name: 'asset.txt', code: Buffer.from('new') }
          ]
        },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/partial/)
    expect(metadataConditions).toEqual(['"file-v1"'])
  })

  it('rejects a metadata PATCH response with missing HTTP status', async () => {
    metadataPatch = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    const patch = jest
      .spyOn(
        require('../request/RequestClient').RequestClient.prototype,
        'patch'
      )
      .mockResolvedValueOnce({ result: {} })
    try {
      await expect(
        sasjs.deployServicePack(
          {
            members: [
              { type: 'file', name: 'asset.txt', code: Buffer.from('new') }
            ]
          },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow(/partial/)
    } finally {
      patch.mockRestore()
    }
  })

  it('replays file upload bytes and multipart boundary on CSRF retry', async () => {
    fileCsrf = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await sasjs.deployServicePack(
      {
        members: [{ type: 'file', name: 'asset.txt', code: Buffer.from('new') }]
      },
      undefined,
      undefined,
      'token',
      true
    )
    expect(fileBodies).toHaveLength(2)
    expect(fileBodies[1]).toBe(fileBodies[0])
    expect(fileHeaders[1]).toBe(fileHeaders[0])
  }, 10000)

  it('does not let a CSRF challenge replace a recycle If-Match precondition', async () => {
    hostileChallenge = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(patchConditions).toEqual(['"root-v1"'])
  })

  it('does not retry a denial without a fresh challenge even with cached CSRF state', async () => {
    noMoveChallenge = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    ;(sasjs as any).requestClient.csrfToken = {
      headerName: 'x-test-csrf',
      value: 'old'
    }
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(patchConditions).toHaveLength(1)
  })

  it('does not repeatedly retry a denied recycle move with a cached CSRF token', async () => {
    repeatedMoveDenial = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(patchConditions).toHaveLength(2)
    expect(events.some((e) => e.startsWith('POST '))).toBe(false)
  })

  it('retains the move precondition on CSRF retry', async () => {
    csrfChallenge = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await sasjs.deployServicePack(
      { members: [] },
      undefined,
      undefined,
      'token',
      true
    )
    expect(patchConditions).toEqual(['"root-v1"', '"root-v1"'])
  })

  it('does not follow a redirect from the deployment server', async () => {
    let leaked = 0
    const other = http.createServer((req, res) => {
      leaked++
      res.statusCode = 200
      res.end('{}')
    })
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve))
    const otherOrigin = `http://127.0.0.1:${(other.address() as AddressInfo).port}`
    const redirect = http.createServer((_req, res) => {
      res.statusCode = 302
      res.setHeader('Location', otherOrigin + '/stolen')
      res.end()
    })
    await new Promise<void>((resolve) =>
      redirect.listen(0, '127.0.0.1', resolve)
    )
    const redirectOrigin = `http://127.0.0.1:${(redirect.address() as AddressInfo).port}`
    try {
      const sasjs = new SASjs({
        serverUrl: redirectOrigin,
        serverType: ServerType.SasViya,
        appLoc: '/Public/app'
      })
      await expect(
        sasjs.deployServicePack(
          { members: [] },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow()
      expect(leaked).toBe(0)
    } finally {
      await new Promise<void>((resolve) => redirect.close(() => resolve()))
      await new Promise<void>((resolve) => other.close(() => resolve()))
    }
  })

  it('reports every pack member immediately before its write during forced deployment', async () => {
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    const reports: any[] = []
    const writeCounts: number[] = []
    await sasjs.deployServicePack(
      {
        members: [
          {
            type: 'folder',
            name: 'nested',
            members: [
              { type: 'file', name: 'file.txt', code: Buffer.from('nested') },
              { type: 'service', name: 'job', code: 'run;' }
            ]
          },
          { type: 'file', name: 'root.txt', code: Buffer.from('root') }
        ]
      },
      undefined,
      undefined,
      'token',
      true,
      (progress: any) => {
        reports.push(progress)
        writeCounts.push(
          events.filter(
            (e) =>
              e.startsWith('POST /folders/folders?') ||
              e.startsWith('POST /files/files') ||
              e.startsWith('POST /jobDefinitions/definitions')
          ).length
        )
      }
    )
    expect(reports).toEqual([
      {
        type: 'folder',
        name: 'nested',
        parentFolder: '/Public/app',
        index: 1,
        total: 4
      },
      {
        type: 'file',
        name: 'file.txt',
        parentFolder: '/Public/app/nested',
        index: 2,
        total: 4
      },
      {
        type: 'service',
        name: 'job',
        parentFolder: '/Public/app/nested',
        index: 3,
        total: 4
      },
      {
        type: 'file',
        name: 'root.txt',
        parentFolder: '/Public/app',
        index: 4,
        total: 4
      }
    ])
    expect(writeCounts).toEqual([1, 2, 3, 4])
  })

  it.each([
    ['root', { name: 'wrong' }],
    ['root', { parentFolderUri: `/folders/folders/${binId}` }],
    ['nested', { name: 'wrong' }],
    ['nested', { parentFolderUri: `/folders/folders/${binId}` }]
  ])(
    'stops before writing children when %s creation identity mismatches %#',
    async (level, overrides) => {
      if (level === 'root') rootCreateOverrides = overrides
      else nestedCreateOverrides = overrides
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public/app'
      })
      await expect(
        sasjs.deployServicePack(
          {
            members: [
              {
                type: 'folder',
                name: 'nested',
                members: [{ type: 'service', name: 'job', code: '' }]
              }
            ]
          },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow(/created.*folder identity/i)
      expect(events.some((e) => e.startsWith('POST /jobDefinitions/'))).toBe(
        false
      )
      if (level === 'root')
        expect(
          events.filter((e) => e.startsWith('POST /folders/folders?'))
        ).toHaveLength(1)
    }
  )

  it('deploys nested members to newly created folder IDs', async () => {
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await sasjs.deployServicePack(
      {
        members: [
          {
            type: 'folder',
            name: 'nested',
            members: [
              { type: 'file', name: 'file.txt', code: Buffer.from('nested') },
              { type: 'service', name: 'job', code: 'run;' }
            ]
          }
        ]
      },
      undefined,
      undefined,
      'token',
      true
    )
    expect(
      events.filter((e) => e.startsWith('POST /files/files'))[0]
    ).toContain(nestedId)
    expect(
      events.filter((e) => e.startsWith('POST /jobDefinitions/definitions'))[0]
    ).toContain(nestedId)
    expect(
      events.filter((e) => e.startsWith('PUT /folders/folders/'))
    ).toHaveLength(1)
  })

  it('uses the overridden server for every request', async () => {
    const sasjs = new SASjs({
      serverUrl: 'http://127.0.0.1:1',
      serverType: ServerType.SasViya,
      appLoc: '/Public/other'
    })
    await sasjs.deployServicePack(
      { members: [] },
      '/Public/app',
      origin,
      'token',
      true
    )
    expect(events.some((e) => e.startsWith('POST /folders/folders?'))).toBe(
      true
    )
  })

  it('creates an absent app without a recycle move', async () => {
    present = false
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await sasjs.deployServicePack(
      { members: [] },
      undefined,
      undefined,
      'token',
      true
    )
    expect(events.some((e) => e.startsWith('PUT '))).toBe(false)
    expect(events.some((e) => e.startsWith('POST /folders/folders?'))).toBe(
      true
    )
  })

  it('does not trust a page-sized count as a complete recycle listing', async () => {
    listCount = 100
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow()
    expect(events.some((e) => e.startsWith('PUT '))).toBe(false)
  })

  it('refuses to recreate the app if the exact moved folder is not in the recycle destination', async () => {
    hideMoved = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/recycle/i)
    expect(events.some((e) => e.startsWith('POST /folders/folders?'))).toBe(
      false
    )
  })

  it('refuses a recycle name collision before moving', async () => {
    collision = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/collision/)
    expect(events.some((e) => e.startsWith('PUT '))).toBe(false)
  })

  it('rejects a non-successful folder create response', async () => {
    folderStatus = 400
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [] },
        undefined,
        undefined,
        'token',
        true
      )
    ).rejects.toThrow(/partial/)
  })

  it.each([
    '東京.txt',
    'café.txt',
    'quoted"name.txt',
    'line\r\nbreak.txt',
    'bad\u0080.txt',
    'bad\ud800.txt'
  ])(
    'rejects unsupported file name %s before any request, even when nested',
    async (name) => {
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public/app'
      })
      await expect(
        sasjs.deployServicePack(
          {
            members: [
              {
                type: 'folder',
                name: 'nested',
                members: [{ type: 'file', name, code: 'data' }]
              }
            ]
          },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toThrow(/file.*name|member.*name/i)
      expect(events).toEqual([])
      expect(present).toBe(true)
      expect(oldContents).toEqual([
        'asset.txt:old',
        'unrelated:keep only in recycle bin'
      ])
    }
  )

  it('preserves an accepted ASCII file name and content in the actual HTTP upload', async () => {
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await sasjs.deployServicePack(
      {
        members: [
          {
            type: 'file',
            name: 'report + (1).txt',
            code: Buffer.from('content:hello')
          }
        ]
      },
      undefined,
      undefined,
      'token',
      true
    )
    expect(fileDispositions).toEqual(['filename="report + (1).txt";'])
    expect(fileBodies[0]).toContain('filename="report + (1).txt"')
    expect(fileBodies[0]).toContain('content:hello')
  })

  it('does not PATCH if a non-forced file create omits its metadata patch link', async () => {
    metadataPatch = true
    omitFilePatchLink = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.createFile(
        'asset.txt',
        Buffer.from('new'),
        '/Public/app',
        `/folders/folders/${newId}`,
        'token'
      )
    ).rejects.toThrow()
    expect(events.some((event) => event.startsWith('PATCH '))).toBe(false)
  })

  it('does not recycle without force', async () => {
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        {
          members: [
            { type: 'file', name: 'asset.txt', code: Buffer.from('new') }
          ]
        },
        undefined,
        undefined,
        'token',
        false
      )
    ).rejects.toThrow()
    expect(events.some((e) => e.startsWith('PUT /folders/folders/'))).toBe(
      false
    )
  })

  it('recycles the whole app, including unrelated content, then deploys root files into the recreated folder', async () => {
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await sasjs.deployServicePack(
      {
        members: [{ type: 'file', name: 'asset.txt', code: Buffer.from('new') }]
      },
      undefined,
      undefined,
      'token',
      true
    )
    expect(oldContents).toEqual([
      'asset.txt:old',
      'unrelated:keep only in recycle bin'
    ])
    expect(events.filter((e) => e.startsWith('PUT /folders/folders/'))).toEqual(
      [`PUT /folders/folders/${rootId}`]
    )
    expect(moveBodies).toEqual([
      {
        name: rootId,
        type: 'folder',
        description: 'preserve me',
        version: 1,
        parentFolderUri: `/folders/folders/${binId}`
      }
    ])
    expect(
      events.filter((e) => e.startsWith('POST /folders/folders?'))
    ).toHaveLength(1)
    expect(newContents).toHaveLength(1)
    expect(newContents[0]).toContain('new')
    expect(
      events.filter(
        (e) =>
          e.startsWith('GET /folders/folders/@item?path=') &&
          (e.includes('%2FPublic%2Fapp') || e.includes('/Public/app'))
      )
    ).toHaveLength(2)
  })
})
