/**
 * The root-folder create against a server that does NOT collapse a doubled slash.
 *
 * adapter#974 was found by driving this client at a Viya emulator over real HTTP,
 * and the estate that would prove the fix is not available to run it against. This
 * spec is the next best evidence: a local HTTP server that behaves the way the
 * issue describes - it mints a folder id from the path it is given, so a request
 * for `?path=//app` asks about a folder that does not exist and answers 404.
 *
 * Everything else is real: the client's own RequestClient, axios, the folder map,
 * and the create. Nothing here is mocked, which is the point - the mocked
 * RequestClient in SASViyaApiClient.spec.ts cannot tell a doubled slash from a
 * single one, because it never looks at the URL.
 */
// This spec is about the requests that reach a server, so axios must be the real
// one: src/__mocks__/axios.ts is picked up automatically for every other suite.
jest.unmock('axios')

import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse
} from 'node:http'
import { AddressInfo } from 'node:net'
import { RequestClient } from './request/RequestClient'
import { SASViyaApiClient } from './SASViyaApiClient'

type Folder = { id: string; name: string; memberCount: number }

const server: {
  instance: Server
  url: string
  requests: string[]
  folders: Map<string, Folder>
} = {} as any

/** A path is a folder only if it was created with exactly that string. */
const foldersByPath = () => server.folders

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const handle = (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', server.url)
  server.requests.push(`${req.method} ${url.pathname}${url.search}`)

  // GET /folders/folders/@item?path=<path>
  if (req.method === 'GET' && url.pathname === '/folders/folders/@item') {
    const path = url.searchParams.get('path') || ''
    const folder = foldersByPath().get(path)
    if (!folder) return json(res, 404, { message: `No folder at ${path}` })
    return json(res, 200, folder)
  }

  // GET /folders/folders/<id>/members
  const members = url.pathname.match(/^\/folders\/folders\/([^/]+)\/members$/)
  if (req.method === 'GET' && members) {
    const folder = [...foldersByPath().values()].find(
      (f) => f.id === members[1]
    )
    if (!folder) return json(res, 404, { message: `No folder ${members[1]}` })
    return json(res, 200, { items: [], count: 0 })
  }

  // POST /folders/folders?parentFolderUri=<uri>
  if (req.method === 'POST' && url.pathname === '/folders/folders') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const { name } = JSON.parse(body || '{}')
      const parent = url.searchParams.get('parentFolderUri') || ''
      const parentFolder = [...foldersByPath().values()].find(
        (f) => `/folders/folders/${f.id}` === parent
      )
      if (!parentFolder)
        return json(res, 400, { message: `No parent ${parent}` })
      const folder = {
        id: `id-${parentFolder.id}-${name}`,
        name,
        memberCount: 0
      }
      // the server records the folder under the parent's own path, which is what a
      // later `?path=` lookup has to match exactly
      const parentPath = [...foldersByPath()].find(
        ([, f]) => f.id === parentFolder.id
      )?.[0]
      // the server derives the path from what it knows (the parent's own path and
      // the name), so it stores '/app' - a server that concatenated blindly would
      // be reproducing the client bug in the fixture
      foldersByPath().set(
        `${parentPath}/${name}`.replace(/\/{2,}/g, '/'),
        folder
      )
      return json(res, 201, folder)
    })
    return
  }

  json(res, 404, { message: `Unhandled ${req.method} ${url.pathname}` })
}

describe('createFolder at the root, against a server that does not collapse slashes', () => {
  beforeEach(async () => {
    server.requests = []
    server.folders = new Map([['/', { id: 'root', name: '', memberCount: 1 }]])
    server.instance = createServer(handle)
    await new Promise<void>((resolve) =>
      server.instance.listen(0, '127.0.0.1', resolve)
    )
    const { port } = server.instance.address() as AddressInfo
    server.url = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.instance.close(() => resolve()))
  })

  it('creates the folder without asking about "//app"', async () => {
    const rc = new RequestClient(server.url)
    const client = new SASViyaApiClient(server.url, '/', 'context', rc)

    const folder = await client.createFolder('app', '/')

    expect(folder.id).toEqual('id-root-app')
    expect(server.requests.filter((r) => r.includes('//'))).toEqual([])
    expect(server.folders.has('/app')).toBe(true)
  })
})
