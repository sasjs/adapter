/** @jest-environment jsdom */
import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'
import * as publicApi from '../index'
import * as axiosFactory from '../utils/createAxiosInstance'

jest.unmock('axios')

describe('adapter mock readiness', () => {
  const calls: string[] = []
  const configs: InternalAxiosRequestConfig[] = []
  let release: (value: unknown) => void

  beforeEach(() => {
    calls.length = 0
    configs.length = 0
    ;(window as any).__sasjsMockReady = new Promise((resolve) => {
      release = resolve
    })
    jest
      .spyOn(axiosFactory, 'createAxiosInstance')
      .mockImplementation((baseURL) => {
        const instance = axios.create({ baseURL })
        instance.defaults.adapter = async (
          config: InternalAxiosRequestConfig
        ) => {
          calls.push(config.url || '')
          configs.push(config)
          return {
            config,
            status: 200,
            statusText: 'OK',
            headers: {},
            data: { username: 'test', result: [{ value: 1 }] }
          } as AxiosResponse
        }
        return instance
      })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete (window as any).__sasjsMockReady
  })

  it('holds a service request and session check until the host is ready', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const service = sasjs.request('service', null)
    const session = sasjs.checkSession()

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(calls).toEqual([])

    release({})
    await Promise.all([service, session])
    expect(calls).toHaveLength(2)
    expect(calls.some((url) => url.includes('/stp/execute'))).toBe(true)
    expect(calls.some((url) => url.includes('/session'))).toBe(true)
  })

  it('keeps uploads pending until readiness then sends their multipart payload', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const file = new File(['example'], 'example.txt', { type: 'text/plain' })
    const request = sasjs.uploadFile(
      'service',
      [{ file, fileName: 'example.txt' }],
      null
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(calls).toEqual([])
    release({})
    await request
    expect(calls).toHaveLength(1)
    expect(configs[0].data).toBeInstanceOf(FormData)
    expect(
      Array.from((configs[0].data as FormData).entries()).some(
        ([, value]) => value instanceof File && value.name === 'example.txt'
      )
    ).toBe(true)
  })

  it('exposes the bootstrap error in public file upload failures', async () => {
    ;(window as any).__sasjsMockReady = Promise.reject(
      new Error('drive unavailable')
    )
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const file = new File(['example'], 'example.txt')
    await expect(
      sasjs.uploadFile('service', [{ file, fileName: 'example.txt' }], null)
    ).rejects.toMatchObject({
      error: { message: expect.stringContaining('drive unavailable') }
    })
    expect(calls).toEqual([])
  })

  it('preserves the assembled SASjs token after readiness', async () => {
    localStorage.setItem('accessToken', 'old-token')
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const request = sasjs.request('service', null)
    await new Promise((resolve) => setTimeout(resolve, 10))
    localStorage.setItem('accessToken', 'new-token')
    release({})
    await request
    expect(configs[0].headers.get('Authorization')).toBe('Bearer old-token')
  })

  it.each(['get', 'post', 'put', 'patch', 'delete', 'uploadFile'])(
    'preserves implicit credentials for %s after readiness',
    async (method) => {
      localStorage.setItem('accessToken', 'old-token')
      const sasjs = new SASjs({
        serverUrl: location.origin,
        serverType: ServerType.Sasjs
      })
      const client = (sasjs as any).requestClient
      const request =
        method === 'get'
          ? client.get('/SASjsApi/session', undefined)
          : method === 'delete'
            ? client.delete('/SASjsApi/session')
            : method === 'uploadFile'
              ? client.uploadFile('/SASjsApi/session', 'body')
              : client[method]('/SASjsApi/session', {}, undefined)
      await new Promise((resolve) => setTimeout(resolve, 10))
      localStorage.setItem('accessToken', 'new-token')
      release({})
      await request
      expect(configs[0].headers.get('Authorization')).toBe('Bearer old-token')
    }
  )

  it('preserves explicit tokens and authorization overrides while waiting', async () => {
    localStorage.setItem('accessToken', 'old-token')
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient
    const explicit = client.get('/SASjsApi/session', 'explicit-token')
    const override = client.get(
      '/SASjsApi/session',
      undefined,
      'application/json',
      { authorization: 'Bearer override-token' }
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    localStorage.setItem('accessToken', 'new-token')
    release({})
    await Promise.all([explicit, override])
    expect(configs[0].headers.get('Authorization')).toBe(
      'Bearer explicit-token'
    )
    expect(configs[1].headers.get('Authorization')).toBe(
      'Bearer override-token'
    )
  })

  it('preserves an assembled token even if storage is cleared', async () => {
    localStorage.setItem('accessToken', 'old-token')
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const request = sasjs.request('service', null)
    await new Promise((resolve) => setTimeout(resolve, 10))
    localStorage.removeItem('accessToken')
    release({})
    await request
    expect(configs[0].headers.get('Authorization')).toBe('Bearer old-token')
  })

  it('does not delay an adapter with no readiness contract', async () => {
    delete (window as any).__sasjsMockReady
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    await sasjs.request('service', null)
    expect(calls).toHaveLength(1)
  })

  it('dispatches mutable FormData synchronously without a readiness contract', async () => {
    delete (window as any).__sasjsMockReady
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient
    let sent: FormDataEntryValue | null | undefined
    client.httpClient.defaults.adapter = (
      config: InternalAxiosRequestConfig
    ) => {
      sent = (config.data as FormData).get('value')
      return Promise.resolve({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {}
      } as AxiosResponse)
    }
    const form = new FormData()
    form.set('value', 'original')
    const request = client.post(
      '/SASjsApi/session',
      form,
      undefined,
      'multipart/form-data'
    )
    form.set('value', 'changed')
    expect(sent).toBe('original')
    await request
  })

  it('preserves FormData identity for a custom adapter', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient.httpClient
    const form = new FormData()
    form.append('value', 'original')
    const request = client.post('/resource', form)
    form.set('value', 'changed')
    release({})
    await request
    expect(configs[0].data).toBe(form)
    expect(configs[0].data.get('value')).toBe('changed')
  })

  it('exports the readiness failure class from the public entry point', async () => {
    ;(window as any).__sasjsMockReady = Promise.reject(new Error('boot failed'))
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const ErrorClass = publicApi.MockReadinessError
    expect(typeof ErrorClass).toBe('function')
    await expect(sasjs.checkSession()).rejects.toBeInstanceOf(ErrorClass)
  })

  it('surfaces a rejected host promise without sending a request', async () => {
    const failure = new Error('worker failed')
    ;(window as any).__sasjsMockReady = Promise.reject(failure)
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    await expect(sasjs.checkSession()).rejects.toThrow(/worker failed/)
    expect(calls).toEqual([])
  })

  it('preserves the host failure in verbose mode', async () => {
    ;(window as any).__sasjsMockReady = Promise.reject(
      new Error('worker failed')
    )
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs,
      verbose: true
    })
    await expect(sasjs.checkSession()).rejects.toThrow(/worker failed/)
    expect(calls).toEqual([])
  })

  it('respects a request timeout while awaiting the host', async () => {
    jest.useFakeTimers()
    try {
      const sasjs = new SASjs({
        serverUrl: location.origin,
        serverType: ServerType.Sasjs
      })
      const client = (sasjs as any).requestClient.httpClient
      const pending = client.get('/SASjsApi/session', { timeout: 10 })
      const rejection = expect(pending).rejects.toMatchObject({
        code: 'ECONNABORTED'
      })
      await jest.advanceTimersByTimeAsync(11)
      await rejection
      expect(calls).toEqual([])
    } finally {
      jest.useRealTimers()
    }
  })

  it('holds login while the host is starting', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const login = sasjs.logIn('user', 'password')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(calls).toEqual([])
    release({})
    await login
    expect(calls.length).toBeGreaterThan(0)
  })

  it('dispatches an unrelated request synchronously despite a pending mock host', async () => {
    const sasjs = new SASjs({
      serverUrl: 'https://other.example',
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient
    const form = new FormData()
    form.set('value', 'original')
    let sent: FormDataEntryValue | null = null
    client.httpClient.defaults.adapter = (
      config: InternalAxiosRequestConfig
    ) => {
      sent = (config.data as FormData).get('value')
      return Promise.resolve({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {}
      })
    }
    const request = client.post(
      '/resource',
      form,
      undefined,
      'multipart/form-data'
    )
    form.set('value', 'changed')
    expect(sent).toBe('original')
    await request
  })

  it('does not delay an unrelated remote server', async () => {
    const sasjs = new SASjs({
      serverUrl: 'https://other.example',
      serverType: ServerType.Sasjs
    })
    await sasjs.request('service', null)
    expect(calls).toHaveLength(1)
  })

  it.each(['preexisting', 'later-ordered'])(
    'holds when a %s interceptor replaces transformRequest after the gate',
    async (ordering) => {
      const { installMockReadinessGate } =
        await import('../request/mockReadiness')
      const client = axios.create()
      const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => ({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {}
      }))
      client.defaults.adapter = adapter
      const replace = (config: InternalAxiosRequestConfig) => {
        config.transformRequest = [(data) => data]
        return config
      }
      if (ordering === 'preexisting')
        client.interceptors.request.use(replace, undefined, {
          synchronous: true
        })
      installMockReadinessGate(client, {
        promise: (window as any).__sasjsMockReady,
        scope: new URL(location.origin + '/')
      })
      if (ordering === 'later-ordered')
        client.interceptors.request.use(replace, undefined, {
          synchronous: true
        })
      const pending = client.get(
        '/resource',
        ordering === 'later-ordered'
          ? { transitional: { legacyInterceptorReqResOrdering: false } }
          : {}
      )
      try {
        expect(adapter).not.toHaveBeenCalled()
      } finally {
        release({})
        await pending
      }
      expect(adapter).toHaveBeenCalledTimes(1)
    }
  )

  it('holds an adapter selected by a custom transform until readiness', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient.httpClient
    const replacement = jest.fn((config: InternalAxiosRequestConfig) =>
      Promise.resolve({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {}
      })
    )
    const request = client.post('/resource', 'data', {
      transformRequest: [
        function (this: InternalAxiosRequestConfig, data: unknown) {
          this.adapter = replacement
          return data
        }
      ]
    })
    try {
      expect(replacement).not.toHaveBeenCalled()
    } finally {
      release({})
      await request
    }
    expect(replacement).toHaveBeenCalledTimes(1)
  })

  it('honors a transform URL rewrite outside the scope synchronously', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient.httpClient
    const request = client.post('/resource', 'data', {
      transformRequest: [
        function (this: InternalAxiosRequestConfig, data: unknown) {
          this.baseURL = 'https://other.example'
          return data
        }
      ]
    })
    expect(calls).toHaveLength(1)
    await request
  })

  it('cancels a transform-selected adapter while readiness is pending', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient.httpClient
    const controller = new AbortController()
    const replacement = jest.fn()
    const request = client.post('/resource', 'data', {
      signal: controller.signal,
      transformRequest: [
        function (this: InternalAxiosRequestConfig, data: unknown) {
          this.adapter = replacement
          return data
        }
      ]
    })
    controller.abort()
    await expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    release({})
    expect(replacement).not.toHaveBeenCalled()
  })

  it('uses the target after synchronous URL-rewriting interceptors', async () => {
    const sasjs = new SASjs({
      serverUrl: 'https://other.example',
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient.httpClient
    client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        config.baseURL = location.origin
        return config
      },
      undefined,
      { synchronous: true }
    )
    const request = client.get('/SASjsApi/session')
    expect(calls).toEqual([])
    release({})
    await request
    expect(calls).toHaveLength(1)
  })

  it('waits after an asynchronous interceptor redirects into the scope', async () => {
    const sasjs = new SASjs({
      serverUrl: 'https://other.example',
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient.httpClient
    client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        config.baseURL = location.origin
        return config
      }
    )
    const request = client.get('/resource')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual([])
    release({})
    await request
    expect(calls).toHaveLength(1)
  })

  it('dispatches synchronously when an interceptor redirects outside the scope', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient.httpClient
    client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        config.baseURL = 'https://other.example'
        return config
      },
      undefined,
      { synchronous: true }
    )
    const request = client.get('/resource')
    expect(calls).toHaveLength(1)
    await request
  })

  it('waits when a per-call override points an unrelated adapter at the mock', async () => {
    const sasjs = new SASjs({
      serverUrl: 'https://other.example',
      serverType: ServerType.Sasjs
    })
    const request = sasjs.request('service', null, {
      serverUrl: location.origin
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(calls).toEqual([])
    release({})
    await request
    expect(calls).toHaveLength(1)
  })

  it('does not delay a same-origin request outside the worker scope', async () => {
    history.replaceState(null, '', '/demo/index.html')
    const boot = document.createElement('script')
    boot.src = '/demo/host/boot.js'
    document.head.appendChild(boot)
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    try {
      const request = sasjs.request('service', null, {
        serverUrl: location.origin + '/outside'
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(calls).toHaveLength(1)
      await request
    } finally {
      release({})
      boot.remove()
      history.replaceState(null, '', '/')
    }
  })

  it.each([
    { page: '/outside/index.html', base: '/demo/', gated: true },
    { page: '/demo/index.html', base: '/outside/', gated: false }
  ])(
    'uses document base URL for relative requests: $base',
    async ({ page, base, gated }) => {
      history.replaceState(null, '', page)
      const baseElement = document.createElement('base')
      baseElement.href = base
      document.head.appendChild(baseElement)
      const boot = document.createElement('script')
      boot.src = '/demo/host/boot.js'
      document.head.appendChild(boot)
      try {
        const sasjs = new SASjs({
          serverUrl: location.origin,
          serverType: ServerType.Sasjs
        })
        const client = (sasjs as any).requestClient.httpClient
        const request = client.get('resource', { baseURL: '' })
        expect(calls).toHaveLength(gated ? 0 : 1)
        release({})
        await request
        expect(calls).toHaveLength(1)
      } finally {
        release({})
        boot.remove()
        baseElement.remove()
        history.replaceState(null, '', '/')
      }
    }
  )

  it('waits for Axios requests whose base URL places them within the worker scope', async () => {
    history.replaceState(null, '', '/demo/index.html')
    const boot = document.createElement('script')
    boot.src = '/demo/host/boot.js'
    document.head.appendChild(boot)
    try {
      const sasjs = new SASjs({
        serverUrl: location.origin + '/demo',
        serverType: ServerType.Sasjs
      })
      const client = (sasjs as any).requestClient.httpClient
      const request = client.get('/SASjsApi/session')
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(calls).toEqual([])
      release({})
      await request
      expect(calls).toHaveLength(1)
    } finally {
      release({})
      boot.remove()
      history.replaceState(null, '', '/')
    }
  })

  it('keeps cancellation rejected when verbose logging is enabled', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs,
      verbose: true
    })
    const client = (sasjs as any).requestClient.httpClient
    const controller = new AbortController()
    const pending = client.get('/SASjsApi/session', {
      signal: controller.signal
    })
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'ERR_CANCELED'
    })
    await Promise.resolve()
    controller.abort()
    await rejection
    expect(calls).toEqual([])
  })

  it.each(['signal', 'cancelToken'])(
    'does not dispatch when %s is canceled after readiness settles',
    async (kind) => {
      const sasjs = new SASjs({
        serverUrl: location.origin,
        serverType: ServerType.Sasjs
      })
      const client = (sasjs as any).requestClient.httpClient
      const controller = new AbortController()
      const source = axios.CancelToken.source()
      if (kind === 'signal') {
        const remove = controller.signal.removeEventListener.bind(
          controller.signal
        )
        jest
          .spyOn(controller.signal, 'removeEventListener')
          .mockImplementation((...args) => {
            remove(...args)
            controller.abort()
          })
      } else {
        const unsubscribe = source.token.unsubscribe.bind(source.token)
        jest
          .spyOn(source.token, 'unsubscribe')
          .mockImplementation((listener) => {
            unsubscribe(listener)
            source.cancel('stop')
          })
      }
      const pending = client.get('/SASjsApi/session', {
        signal: controller.signal,
        cancelToken: source.token
      })
      const rejection = expect(pending).rejects.toMatchObject({
        code: 'ERR_CANCELED'
      })
      release({})
      await rejection
      expect(calls).toEqual([])
    }
  )

  it('cancels a pending request without waiting for host readiness', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const client = (sasjs as any).requestClient.httpClient
    const controller = new AbortController()
    const pending = client.get('/SASjsApi/session', {
      signal: controller.signal
    })
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'ERR_CANCELED'
    })
    await Promise.resolve()
    controller.abort()
    await Promise.race([
      rejection,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('cancellation did not settle')), 50)
      )
    ])
    expect(calls).toEqual([])
  })

  it('allows a healthy host to take longer than 30 seconds to initialize', async () => {
    jest.useFakeTimers()
    try {
      const sasjs = new SASjs({
        serverUrl: location.origin,
        serverType: ServerType.Sasjs
      })
      const request = sasjs.request('service', null)
      await jest.advanceTimersByTimeAsync(35000)
      expect(calls).toEqual([])
      release({})
      await request
      expect(calls).toHaveLength(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('times out a stalled bootstrap without sending the request', async () => {
    jest.useFakeTimers()
    try {
      const sasjs = new SASjs({
        serverUrl: location.origin,
        serverType: ServerType.Sasjs
      })
      const request = sasjs.request('service', null)
      const rejection = expect(request).rejects.toMatchObject({
        error: { message: expect.stringMatching(/timed out/) }
      })
      await jest.advanceTimersByTimeAsync(120000)
      await rejection
      expect(calls).toEqual([])
    } finally {
      jest.useRealTimers()
    }
  })

  it('surfaces failed bootstrap on session checks without trying to log out', async () => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    localStorage.setItem('accessToken', 'existing-session')
    const result = sasjs.checkSession()
    release({ error: 'identity failed' })
    await expect(result).rejects.toThrow(/identity failed/)
    expect(localStorage.getItem('accessToken')).toBe('existing-session')
    expect(calls).toEqual([])
  })

  it.each([
    { error: 'identity failed' },
    { driveError: 'drive failed' },
    { boot: { driveError: 'nested drive failed' } }
  ])('refuses a legacy fulfilled boot error: %o', async (failure) => {
    const sasjs = new SASjs({
      serverUrl: location.origin,
      serverType: ServerType.Sasjs
    })
    const request = sasjs.request('service', null)
    release(failure)
    await expect(request).rejects.toMatchObject({
      error: { message: expect.stringMatching(/failed/) }
    })
    expect(calls).toEqual([])
  })
})
