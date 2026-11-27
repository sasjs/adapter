const http = require('http')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const folderId = 'cc4760b1-e3de-40d4-916c-950cb4e40128'
const fileId = '11111111-2222-3333-4444-555555555555'
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
    replace
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
          return res.end(
            JSON.stringify({
              items: [
                { extensions: ['txt'], name: 'file', properties: { x: 'y' } }
              ]
            })
          )
        if (req.url.startsWith('/folders/folders/@item'))
          return res.end(JSON.stringify({ id: folderId }))
        if (req.url.includes('/members?'))
          return res.end(
            JSON.stringify({
              count: 1,
              items: [
                {
                  name: 'asset.txt',
                  contentType: 'file',
                  uri: `/files/files/${fileId}`
                }
              ]
            })
          )
        if (req.method === 'GET' && req.url === `/files/files/${fileId}`) {
          res.setHeader('ETag', '"v1"')
          return res.end(
            JSON.stringify({
              id: fileId,
              name: 'asset.txt',
              contentType: 'text/plain'
            })
          )
        }
        if (req.method === 'POST' && req.url.startsWith('/files/files')) {
          if (replace) {
            res.statusCode = 409
            return res.end(
              JSON.stringify({
                errorCode: 0,
                httpStatusCode: 409,
                message: `File with name "asset.txt" already exists in folder "${folderId}".`
              })
            )
          }
          res.statusCode = 201
          return res.end(
            JSON.stringify({
              id: fileId,
              links: [
                { method: 'PATCH', rel: 'patch', uri: `/files/files/${fileId}` }
              ]
            })
          )
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
    replace = false
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
    const expression = `(async () => { try { const sas = new SASjs.default({ serverUrl: location.origin, serverType: 'SASVIYA', appLoc: '/Public' }); await sas.deployServicePack({ members: [{ type: 'file', name: 'asset.txt', code: new TextEncoder().encode('hello') }] }, undefined, undefined, 'bearer-secret', true); return { ok: true } } catch (error) { return { ok: false, message: String(error.message) } } })()`
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
  it.each([
    ['GET', '/folders/folders/@item'],
    ['GET', '/types/types'],
    ['POST', '/files/files'],
    ['PATCH', `/files/files/${fileId}`]
  ])(
    'stops deployment after redirected %s %s without side effects',
    async (method, path) => {
      redirect = { method, path, target: `${attacker}/capture` }
      const result = await deploy()
      expect(result.ok).toBe(false)
      expect(requests.filter((r) => r.host === 'attacker')).toEqual([])
      expect(
        requests.filter(
          (r) => r.method === 'POST' && r.url.startsWith('/files/files')
        )
      ).toHaveLength(method === 'POST' || method === 'PATCH' ? 1 : 0)
    }
  )
  it('replaces a duplicate file using its ETag in the browser', async () => {
    replace = true
    expect(await deploy()).toEqual({ ok: true })
    const updates = requests.filter((r) => r.method === 'PUT')
    expect(updates).toHaveLength(1)
    expect(updates[0].body).toBe('hello')
    expect(updates[0].ifMatch).toBe('"v1"')
  })
  it.each([302, 307, 308])(
    'does not follow a %s redirect after a CSRF challenge',
    async (status) => {
      challenge = true
      redirect = {
        method: 'POST',
        path: '/files/files',
        target: `${attacker}/capture`,
        status
      }
      expect((await deploy()).ok).toBe(false)
      expect(requests.filter((r) => r.host === 'attacker')).toEqual([])
      const uploads = requests.filter(
        (r) => r.method === 'POST' && r.url.startsWith('/files/files')
      )
      expect(uploads).toHaveLength(2)
      expect(uploads[1].csrf).toBe('new-csrf')
    }
  )
  it.each([
    ['GET', '/folders/folders/'],
    ['GET', `/files/files/${fileId}`],
    ['PUT', `/files/files/${fileId}/content`]
  ])('blocks redirects during replacement %s %s', async (method, path) => {
    replace = true
    redirect = { method, path, target: `${attacker}/capture` }
    expect((await deploy()).ok).toBe(false)
    expect(requests.filter((r) => r.host === 'attacker')).toEqual([])
    expect(
      requests.some((r) => r.method === method && r.url.startsWith(path))
    ).toBe(true)
    expect(requests.filter((r) => r.method === 'PUT')).toHaveLength(
      method === 'PUT' ? 1 : 0
    )
  })
  it('does not follow same-origin redirects either', async () => {
    redirect = {
      method: 'POST',
      path: '/files/files',
      target: `${origin}/other`
    }
    expect((await deploy()).ok).toBe(false)
    expect(requests.some((r) => r.url === '/other')).toBe(false)
  })
  it('fails before network if Request ignores the redirect mode', async () => {
    const expression = `(async () => { const Original = window.Request; window.Request = function () { return { redirect: 'follow' } }; try { const sas = new SASjs.default({ serverUrl: location.origin, serverType: 'SASVIYA', appLoc: '/Public' }); await sas.deployServicePack({ members: [{ type: 'file', name: 'asset.txt', code: 'hello' }] }); return 'unexpected success' } catch (e) { return e.message } finally { window.Request = Original } })()`
    const result = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sid
    )
    expect(result.result.value).toMatch(/redirect/i)
    expect(requests).toEqual([])
  })
})
