const http = require('http')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const folderId = 'cc4760b1-e3de-40d4-916c-950cb4e40128'
const fileId = '11111111-2222-3333-4444-555555555555'
const parentId = '22222222-2222-4222-8222-222222222222'
const binId = '33333333-3333-4333-8333-333333333333'
const bundle = path.join(__dirname, '../../build/dist/sasjs-adapter.js')

// Run after `npm run build` with SASJS_BROWSER_DEPLOY_TEST=1. This opt-in
// integration test needs Chromium and the freshly built browser bundle.
const browserSuite =
  process.env.SASJS_BROWSER_DEPLOY_TEST === '1' ? describe : describe.skip
browserSuite('browser Viya deployment over real HTTP', () => {
  let origin, attacker, browser, socket, sid, directory
  let servers = [],
    requests = [],
    redirect,
    challenge,
    dropUpload,
    moved
  let nextId = 0,
    pending = new Map()
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, (message) =>
        message.error
          ? reject(new Error(message.error.message))
          : resolve(message.result)
      )
      socket.send(JSON.stringify({ id, method, params, sessionId }))
    })
  const start = (handler) =>
    new Promise((resolve) => {
      const server = http.createServer(handler)
      servers.push(server)
      server.listen(0, '127.0.0.1', () =>
        resolve(`http://127.0.0.1:${server.address().port}`)
      )
    })
  beforeAll(async () => {
    attacker = await start((req, res) => {
      requests.push({ host: 'attacker', url: req.url })
      req.resume()
      res.end('bad')
    })
    origin = await start((req, res) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString()
        requests.push({
          host: 'origin',
          method: req.method,
          url: req.url,
          auth: req.headers.authorization,
          csrf: req.headers['x-csrf'],
          cookie: req.headers.cookie,
          ifMatch: req.headers['if-match'],
          body
        })
        if (req.url === '/') {
          res.setHeader('Set-Cookie', 'session=cookie-secret; Path=/')
          res.setHeader('Content-Type', 'text/html')
          return res.end('<script src="/bundle.js"></script>')
        }
        if (req.url === '/bundle.js') {
          res.setHeader('Content-Type', 'application/javascript')
          return res.end(fs.readFileSync(bundle))
        }
        if (
          dropUpload &&
          req.method === 'POST' &&
          req.url.startsWith('/files/files')
        ) {
          dropUpload = false
          res.writeHead(201, {
            'Content-Type': 'application/json',
            'Content-Length': '100'
          })
          res.write('{')
          return setTimeout(() => res.destroy(), 20)
        }
        if (
          challenge &&
          req.method === 'POST' &&
          req.url.startsWith('/files/files')
        ) {
          challenge = false
          res.writeHead(403, {
            'x-csrf-header': 'x-csrf',
            'x-csrf': 'new-csrf'
          })
          return res.end()
        }
        if (
          redirect &&
          req.method === redirect.method &&
          req.url.startsWith(redirect.path)
        ) {
          res.writeHead(redirect.status || 307, { Location: redirect.target })
          return res.end()
        }
        res.setHeader('Content-Type', 'application/json')
        if (req.url.startsWith('/types/types'))
          return res.end(JSON.stringify({ items: [] }))
        if (req.url.startsWith('/folders/folders/@item')) {
          const p = new URL(req.url, origin).searchParams.get('path')
          if (p === '/Public')
            return res.end(
              JSON.stringify({ id: parentId, name: 'Public', type: 'folder' })
            )
          if (moved) {
            res.statusCode = 404
            return res.end('{}')
          }
          res.setHeader('ETag', '"v1"')
          return res.end(
            JSON.stringify({
              id: folderId,
              name: 'app',
              type: 'folder',
              parentFolderUri: `/folders/folders/${parentId}`
            })
          )
        }
        if (req.url === '/folders/folders/@myRecycleBin')
          return res.end(JSON.stringify({ id: binId, type: 'trashFolder' }))
        if (req.url.includes('/members?'))
          return res.end(
            JSON.stringify({
              count: moved ? 1 : 0,
              items: moved
                ? [
                    {
                      name: folderId,
                      uri: `/folders/folders/${folderId}`
                    }
                  ]
                : []
            })
          )
        if (
          req.method === 'PUT' &&
          req.url === `/folders/folders/${folderId}`
        ) {
          moved = true
          const update = JSON.parse(body)
          return res.end(JSON.stringify({ id: folderId, ...update }))
        }
        if (req.method === 'POST' && req.url.startsWith('/folders/folders?')) {
          res.statusCode = 201
          return res.end(
            JSON.stringify({
              id: folderId,
              name: JSON.parse(body).name,
              type: 'folder',
              parentFolderUri: `/folders/folders/${parentId}`
            })
          )
        }
        if (req.method === 'POST' && req.url.startsWith('/files/files')) {
          res.statusCode = 201
          return res.end(JSON.stringify({ id: fileId, links: [] }))
        }
        res.end(JSON.stringify({ id: folderId }))
      })
    })
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-chrome-'))
    browser = spawn(
      process.env.CHROME_PATH || '/usr/bin/chromium',
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--remote-debugging-port=0',
        `--user-data-dir=${directory}`,
        'about:blank'
      ],
      { stdio: 'ignore' }
    )
    let info
    for (let i = 0; i < 100; i++) {
      try {
        info = fs
          .readFileSync(path.join(directory, 'DevToolsActivePort'), 'utf8')
          .trim()
          .split('\n')
        break
      } catch {
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    if (!info) throw new Error('Chromium did not start')
    socket = new WebSocket(`ws://127.0.0.1:${info[0]}${info[1]}`)
    await new Promise((resolve, reject) => {
      socket.onopen = resolve
      socket.onerror = reject
    })
    socket.onmessage = ({ data }) => {
      const msg = JSON.parse(data)
      if (pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    }
    const target = await send('Target.createTarget', { url: 'about:blank' })
    sid = (
      await send('Target.attachToTarget', {
        targetId: target.targetId,
        flatten: true
      })
    ).sessionId
    await send('Page.enable', {}, sid)
    await send('Runtime.enable', {}, sid)
    await send('Page.navigate', { url: origin }, sid)
    for (let i = 0; i < 100; i++) {
      const r = await send(
        'Runtime.evaluate',
        { expression: 'typeof SASjs !== "undefined"', returnByValue: true },
        sid
      )
      if (r.result.value) break
      await new Promise((r) => setTimeout(r, 100))
    }
  })
  beforeEach(() => {
    requests = []
    redirect = undefined
    challenge = false
    dropUpload = false
    moved = false
  })
  afterAll(async () => {
    if (socket) socket.close()
    if (browser) {
      browser.kill()
      await new Promise((r) => browser.once('exit', r))
    }
    await Promise.all(
      servers.map((server) => new Promise((r) => server.close(r)))
    )
    if (directory) fs.rmSync(directory, { recursive: true, force: true })
  })
  const deploy = async () => {
    const expression = `(async () => { try { const sas = new SASjs.default({ serverUrl: location.origin, serverType: 'SASVIYA', appLoc: '/Public/app' }); await sas.deployServicePack({ members: [{ type: 'file', name: 'asset.txt', code: new TextEncoder().encode('hello') }] }, undefined, undefined, 'bearer-secret', true); return { ok: true } } catch (error) { return { ok: false, message: String(error.message) } } })()`
    const result = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sid
    )
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }
  it('uploads a file in a browser with bearer, session cookie and CSRF retry', async () => {
    challenge = true
    expect(await deploy()).toEqual({ ok: true })
    const uploads = requests.filter(
      (r) => r.method === 'POST' && r.url.startsWith('/files/files')
    )
    expect(uploads).toHaveLength(2)
    expect(uploads[1]).toMatchObject({
      auth: 'Bearer bearer-secret',
      csrf: 'new-csrf',
      cookie: 'session=cookie-secret'
    })
    expect(uploads[1].body).toContain('hello')
  })
  it('rejects redirect on file upload without forwarding credentials', async () => {
    redirect = {
      method: 'POST',
      path: '/files/files',
      target: `${attacker}/capture`
    }
    expect((await deploy()).ok).toBe(false)
    expect(requests.filter((r) => r.host === 'attacker')).toEqual([])
    expect(
      requests.filter(
        (r) => r.method === 'POST' && r.url.startsWith('/files/files')
      )
    ).toHaveLength(1)
    expect(requests.filter((r) => r.method === 'GET' && r.url === '/')).toEqual(
      []
    )
  })
  it('does not replay an upload after the server drops its response', async () => {
    dropUpload = true
    expect((await deploy()).ok).toBe(false)
    expect(
      requests.filter(
        (r) => r.method === 'POST' && r.url.startsWith('/files/files')
      )
    ).toHaveLength(1)
    expect(requests.filter((r) => r.method === 'GET' && r.url === '/')).toEqual(
      []
    )
  })
  it('blocks cross-origin redirect before sending credentials', async () => {
    redirect = {
      method: 'GET',
      path: '/folders/folders/@item',
      target: `${attacker}/capture`
    }
    expect((await deploy()).ok).toBe(false)
    expect(requests.filter((r) => r.host === 'attacker')).toEqual([])
  })
})
