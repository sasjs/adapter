/** @jest-environment jsdom */
import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { SasjsRequestClient } from '../request/SasjsRequestClient'
import * as axiosFactory from '../utils/createAxiosInstance'

jest.unmock('axios')

describe('mock readiness credential provenance', () => {
  let release: (value: unknown) => void
  let configs: InternalAxiosRequestConfig[]

  beforeEach(() => {
    configs = []
    localStorage.clear()
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
          configs.push(config)
          return {
            config,
            status: 200,
            statusText: 'OK',
            headers: {},
            data: {}
          } as AxiosResponse
        }
        return instance
      })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    localStorage.clear()
    delete (window as any).__sasjsMockReady
  })

  it('retains request credentials when readiness already settled before dispatch', async () => {
    release({})
    const client = new SasjsRequestClient(location.origin)
    await new Promise((resolve) => setTimeout(resolve, 0))
    localStorage.setItem('accessToken', 'original')
    const request = client.get('/SASjsApi/session', undefined)
    localStorage.setItem('accessToken', 'different')
    await request
    expect(configs[0].headers.get('Authorization')).toBe('Bearer original')
  })

  it('keeps each concurrent request bound to the token assembled for it', async () => {
    const client = new SasjsRequestClient(location.origin)
    localStorage.setItem('accessToken', 'first')
    const first = client.get('/SASjsApi/first', undefined)
    localStorage.setItem('accessToken', 'second')
    const second = client.get('/SASjsApi/second', undefined)
    localStorage.removeItem('accessToken')
    const anonymous = client.get('/SASjsApi/anonymous', undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(configs).toHaveLength(0)
    localStorage.setItem('accessToken', 'later')
    release({})
    await Promise.all([first, second, anonymous])
    const headers = (url: string) => configs.find((c) => c.url === url)!.headers
    expect(headers('/SASjsApi/first').get('Authorization')).toBe('Bearer first')
    expect(headers('/SASjsApi/second').get('Authorization')).toBe(
      'Bearer second'
    )
    expect(headers('/SASjsApi/anonymous').has('Authorization')).toBe(false)
  })

  it.each(['get', 'post', 'put', 'patch'])(
    'preserves a request-scoped authorization override for %s',
    async (method) => {
      localStorage.setItem('accessToken', 'stored')
      const client = new SasjsRequestClient(location.origin)
      const headers = { authorization: 'Bearer override' }
      const request =
        method === 'get'
          ? client.get(
              '/SASjsApi/session',
              undefined,
              'application/json',
              headers
            )
          : (client as any)[method](
              '/SASjsApi/session',
              {},
              undefined,
              ...(method === 'post' ? ['application/json', headers] : [headers])
            )
      localStorage.setItem('accessToken', 'later')
      release({})
      await request
      expect(configs[0].headers.get('Authorization')).toBe('Bearer override')
    }
  )

  it('preserves post additionalSettings headers during readiness', async () => {
    localStorage.setItem('accessToken', 'stored')
    const client = new SasjsRequestClient(location.origin)
    const request = client.post(
      '/SASjsApi/session',
      {},
      undefined,
      'application/json',
      {},
      {
        headers: { Authorization: 'Bearer settings' }
      } as any
    )
    localStorage.setItem('accessToken', 'later')
    release({})
    await request
    expect(configs[0].headers.get('Authorization')).toBe('Bearer settings')
  })

  it('preserves an interceptor value even if it is ejected while readiness is pending', async () => {
    localStorage.setItem('accessToken', 'old')
    const client = new SasjsRequestClient(location.origin)
    const axiosClient = (client as any).httpClient
    const id = axiosClient.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        config.headers.set('Authorization', 'Bearer old')
        return config
      }
    )
    const request = client.get('/SASjsApi/session', undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
    axiosClient.interceptors.request.eject(id)
    localStorage.setItem('accessToken', 'new')
    release({})
    await request
    expect(configs[0].headers.get('Authorization')).toBe('Bearer old')
  })

  it('preserves an interceptor explicitly selecting the original token', async () => {
    localStorage.setItem('accessToken', 'old')
    const client = new SasjsRequestClient(location.origin)
    ;(client as any).httpClient.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        config.headers.set('Authorization', 'Bearer old')
        return config
      }
    )
    const request = client.get('/SASjsApi/session', undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
    localStorage.setItem('accessToken', 'new')
    release({})
    await request
    expect(configs[0].headers.get('Authorization')).toBe('Bearer old')
  })

  it('preserves authorization supplied by an Axios request interceptor', async () => {
    localStorage.setItem('accessToken', 'old')
    const client = new SasjsRequestClient(location.origin)
    ;(client as any).httpClient.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        config.headers.set('Authorization', 'Bearer interceptor')
        return config
      }
    )
    const request = client.get('/SASjsApi/session', undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
    localStorage.setItem('accessToken', 'new')
    release({})
    await request
    expect(configs[0].headers.get('Authorization')).toBe('Bearer interceptor')
  })
})
