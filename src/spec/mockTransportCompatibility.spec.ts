/** @jest-environment jsdom */
import axios from 'axios'
import { createServer, Server } from 'http'
import { RequestClient } from '../request/RequestClient'
import { installMockReadinessGate } from '../request/mockReadiness'
import * as axiosFactory from '../utils/createAxiosInstance'

jest.unmock('axios')

describe('mock readiness with real Axios XHR transport', () => {
  let server: Server
  let origin: string
  let release: (value: unknown) => void
  const bodies: string[] = []

  beforeEach(async () => {
    bodies.length = 0
    server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      if (req.method === 'OPTIONS') {
        res.writeHead(204).end()
        return
      }
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        bodies.push(Buffer.concat(chunks).toString())
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as any).port}`
    // Scope detection inspects script URLs; no script needs to be loaded.
    jest
      .spyOn(document, 'scripts', 'get')
      .mockReturnValue([
        { src: `${origin}/demo/host/boot.js` }
      ] as unknown as HTMLCollectionOf<HTMLScriptElement>)
    ;(window as any).__sasjsMockReady = new Promise((resolve) => {
      release = resolve
    })
    jest
      .spyOn(axiosFactory, 'createAxiosInstance')
      .mockImplementation((baseURL) =>
        axios.create({ baseURL, adapter: 'xhr' })
      )
  })

  afterEach(async () => {
    release({})
    delete (window as any).__sasjsMockReady
    jest.restoreAllMocks()
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    )
  })

  it('transforms JSON with nested dates once before caller mutations', async () => {
    const client = new RequestClient(`${origin}/demo`)
    const date = new Date('2020-01-01T00:00:00.000Z')
    const body = [{ date }]
    const pending = client.post('/resource', body, undefined)
    date.setUTCFullYear(2025)
    body.push({ date: new Date('2030-01-01T00:00:00.000Z') })
    release({})
    await pending
    expect(JSON.parse(bodies[0])).toEqual([
      { date: '2020-01-01T00:00:00.000Z' }
    ])
  })

  it('serializes URLSearchParams before caller mutations', async () => {
    const client = new RequestClient(`${origin}/demo`)
    const body = new URLSearchParams({ value: 'original' })
    const pending = client.post(
      '/resource',
      body,
      undefined,
      'application/x-www-form-urlencoded'
    )
    body.set('value', 'changed')
    release({})
    await pending
    expect(bodies[0]).toBe('value=original')
  })

  it('runs custom body and query serialization exactly once', async () => {
    const client = new RequestClient(`${origin}/demo`)
    const http = (client as any).httpClient
    const transform = jest.fn((body) => JSON.stringify(body))
    const serialize = jest.fn(() => 'key=value')
    const pending = http.post(
      '/resource',
      { value: 'original' },
      {
        transformRequest: [transform],
        params: { key: 'value' },
        paramsSerializer: { serialize },
        headers: { 'Content-Type': 'application/json' }
      }
    )
    expect(transform).toHaveBeenCalledTimes(1)
    expect(serialize).toHaveBeenCalledTimes(0)
    release({})
    await pending
    expect(transform).toHaveBeenCalledTimes(1)
    expect(serialize).toHaveBeenCalledTimes(1)
    expect(bodies[0]).toBe('{"value":"original"}')
  })

  it('preserves the XSRF cookie captured before waiting for XHR dispatch', async () => {
    document.cookie = 'XSRF-TOKEN=before; path=/'
    const setHeader = jest.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    try {
      const client = new RequestClient(`${origin}/demo`)
      const http = (client as any).httpClient
      const pending = http.post('/resource', 'body', { withXSRFToken: true })
      document.cookie = 'XSRF-TOKEN=after; path=/'
      release({})
      await pending
      expect(setHeader).toHaveBeenCalledWith('X-XSRF-TOKEN', 'before')
    } finally {
      document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
      setHeader.mockRestore()
    }
  })

  it('does not acquire a newly created XSRF cookie while waiting', async () => {
    document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
    const setHeader = jest.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    try {
      const client = new RequestClient(`${origin}/demo`)
      const pending = (client as any).httpClient.post('/resource', 'body', {
        withXSRFToken: true
      })
      document.cookie = 'XSRF-TOKEN=late; path=/'
      release({})
      await pending
      expect(setHeader).not.toHaveBeenCalledWith('X-XSRF-TOKEN', 'late')
    } finally {
      document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
      setHeader.mockRestore()
    }
  })

  it('preserves an explicit XSRF header when the original cookie is absent', async () => {
    document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
    const setHeader = jest.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    try {
      const client = new RequestClient(`${origin}/demo`)
      const pending = (client as any).httpClient.post('/resource', 'body', {
        withXSRFToken: true,
        headers: { 'X-XSRF-TOKEN': 'explicit' }
      })
      document.cookie = 'XSRF-TOKEN=late; path=/'
      release({})
      await pending
      expect(setHeader).toHaveBeenCalledWith('X-XSRF-TOKEN', 'explicit')
      expect(setHeader).not.toHaveBeenCalledWith('X-XSRF-TOKEN', 'late')
    } finally {
      document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
      setHeader.mockRestore()
    }
  })

  it('does not inject a default XSRF token for a cross-origin target', async () => {
    document.cookie = 'XSRF-TOKEN=before; path=/'
    const setHeader = jest.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    try {
      const client = new RequestClient(`${origin}/demo`)
      const pending = (client as any).httpClient.post('/resource', 'body')
      release({})
      await pending
      expect(setHeader).not.toHaveBeenCalledWith('X-XSRF-TOKEN', 'before')
    } finally {
      document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
      setHeader.mockRestore()
    }
  })

  it('keeps explicitly disabled XSRF injection disabled', async () => {
    document.cookie = 'XSRF-TOKEN=before; path=/'
    const setHeader = jest.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    try {
      const client = new RequestClient(`${origin}/demo`)
      const pending = (client as any).httpClient.post('/resource', 'body', {
        withXSRFToken: false
      })
      release({})
      await pending
      expect(setHeader).not.toHaveBeenCalledWith('X-XSRF-TOKEN', 'before')
    } finally {
      document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
      setHeader.mockRestore()
    }
  })

  it('freezes the XSRF cookie for a functional policy while letting Axios call it once at dispatch', async () => {
    document.cookie = 'XSRF-TOKEN=before; path=/'
    const policy = jest.fn(() => true)
    const setHeader = jest.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    try {
      const client = new RequestClient(`${origin}/demo`)
      const pending = (client as any).httpClient.post('/resource', 'body', {
        withXSRFToken: policy
      })
      expect(policy).not.toHaveBeenCalled()
      document.cookie = 'XSRF-TOKEN=after; path=/'
      release({})
      await pending
      expect(policy).toHaveBeenCalledTimes(1)
      expect(setHeader).toHaveBeenCalledWith('X-XSRF-TOKEN', 'before')
    } finally {
      document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
      setHeader.mockRestore()
    }
  })

  it('matches Axios when an XSRF callback replaces the resolved headers', async () => {
    document.cookie = 'XSRF-TOKEN=before; path=/'
    const setHeader = jest.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    const policy = (config: any) => {
      config.headers = new axios.AxiosHeaders({ 'X-Another': 'value' })
      return true
    }
    try {
      await axios.post(`${origin}/demo/resource`, 'body', {
        adapter: 'xhr',
        withXSRFToken: policy
      })
      expect(setHeader).not.toHaveBeenCalledWith('X-XSRF-TOKEN', 'before')
      setHeader.mockClear()
      const client = new RequestClient(`${origin}/demo`)
      const pending = (client as any).httpClient.post('/resource', 'body', {
        withXSRFToken: policy
      })
      release({})
      await pending
      expect(setHeader).toHaveBeenCalledWith('X-Another', 'value')
      expect(setHeader).not.toHaveBeenCalledWith('X-XSRF-TOKEN', 'before')
    } finally {
      document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
      setHeader.mockRestore()
    }
  })

  it('passes functional XSRF policies their resolved URL once and honors false', async () => {
    document.cookie = 'XSRF-TOKEN=before; path=/'
    const policy = jest.fn((_config: any) => false)
    const serialize = jest.fn(() => 'q=original')
    const setHeader = jest.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    try {
      const client = new RequestClient(`${origin}/demo`)
      const pending = (client as any).httpClient.post('/resource', 'body', {
        withXSRFToken: policy,
        params: { q: 'original' },
        paramsSerializer: { serialize }
      })
      expect(serialize).not.toHaveBeenCalled()
      release({})
      await pending
      expect(policy).toHaveBeenCalledTimes(1)
      expect(policy.mock.calls[0][0].url).toBe(
        `${origin}/demo/resource?q=original`
      )
      expect(serialize).toHaveBeenCalledTimes(1)
      expect(setHeader).not.toHaveBeenCalledWith('X-XSRF-TOKEN', 'before')
    } finally {
      document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
      setHeader.mockRestore()
    }
  })

  it.each(['default', 'true', 'callback'])(
    'does not send the captured XSRF cookie to a new cross-origin base (%s)',
    async (policy) => {
      document.cookie = 'XSRF-TOKEN=before; path=/'
      const base = document.createElement('base')
      base.href = `${location.origin}/demo/`
      document.head.appendChild(base)
      const setHeader = jest.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
      const client = axios.create({ adapter: 'xhr' })
      installMockReadinessGate(client, {
        promise: (window as any).__sasjsMockReady,
        scope: new URL(`${location.origin}/demo/`)
      })
      try {
        const pending = client.post('resource', 'body', {
          withXSRFToken:
            policy === 'default'
              ? undefined
              : policy === 'true'
                ? true
                : () => true
        })
        base.href = `${origin}/demo/`
        release({})
        await pending
        expect(bodies).toHaveLength(1)
        expect(setHeader).not.toHaveBeenCalledWith('X-XSRF-TOKEN', 'before')
      } finally {
        base.remove()
        document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
        setHeader.mockRestore()
      }
    }
  )

  it('checks a base changed by the query serializer before injecting XSRF', async () => {
    document.cookie = 'XSRF-TOKEN=before; path=/'
    const base = document.createElement('base')
    base.href = `${location.origin}/demo/`
    document.head.appendChild(base)
    const setHeader = jest.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    const client = axios.create({ adapter: 'xhr' })
    installMockReadinessGate(client, {
      promise: (window as any).__sasjsMockReady,
      scope: new URL(`${location.origin}/demo/`)
    })
    try {
      const pending = client.post('resource', 'body', {
        withXSRFToken: true,
        params: { q: 'x' },
        paramsSerializer: {
          serialize: () => {
            base.href = `${origin}/demo/`
            return 'q=x'
          }
        }
      })
      release({})
      await pending
      expect(bodies).toHaveLength(1)
      expect(setHeader).not.toHaveBeenCalledWith('X-XSRF-TOKEN', 'before')
    } finally {
      base.remove()
      document.cookie = 'XSRF-TOKEN=; max-age=0; path=/'
      setHeader.mockRestore()
    }
  })

  it('snapshots a mutable ArrayBuffer before waiting', async () => {
    const client = new RequestClient(`${origin}/demo`)
    const buffer = Uint8Array.from('original', (char) => char.charCodeAt(0))
    const pending = client.post(
      '/resource',
      buffer.buffer,
      undefined,
      'application/octet-stream'
    )
    buffer.set(Uint8Array.from('changed!', (char) => char.charCodeAt(0)))
    release({})
    await pending
    expect(bodies[0]).toBe('original')
  })

  it('sends the FormData as it was when dispatched, even if mutated during readiness', async () => {
    const client = new RequestClient(`${origin}/demo`)
    const form = new FormData()
    form.append('value', 'original')
    const pending = client.post(
      '/resource',
      form,
      undefined,
      'multipart/form-data'
    )
    form.set('value', 'changed')
    release({})
    await pending
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toContain('original')
    expect(bodies[0]).not.toContain('changed')
  })
})
