/** @jest-environment jsdom */
import axios, { AxiosHeaders, InternalAxiosRequestConfig } from 'axios'
import { waitForMockReadiness } from '../request/mockReadiness'

jest.unmock('axios')

const config = (
  overrides: Partial<InternalAxiosRequestConfig> = {}
): InternalAxiosRequestConfig => ({
  headers: new AxiosHeaders(),
  url: '/demo/resource',
  ...overrides
})

const ready = (promise: Promise<unknown>) => ({
  promise,
  scope: new URL('/demo/', location.href)
})

describe('mock readiness wait', () => {
  it('does not accumulate host promise reactions for canceled or timed out waits', async () => {
    jest.useFakeTimers()
    try {
      const host = new Promise<unknown>(() => {})
      const then = jest.spyOn(host, 'then')
      const add = jest.spyOn(Set.prototype, 'add')
      const remove = jest.spyOn(Set.prototype, 'delete')
      const controller = new AbortController()
      const canceled = waitForMockReadiness(
        ready(host),
        config({ signal: controller.signal })
      )
      const cancelResult = expect(canceled).rejects.toMatchObject({
        code: 'ERR_CANCELED'
      })
      controller.abort()
      await cancelResult

      const timedOut = waitForMockReadiness(
        ready(host),
        config({ timeout: 10 })
      )
      const timeoutResult = expect(timedOut).rejects.toMatchObject({
        code: 'ECONNABORTED'
      })
      await jest.advanceTimersByTimeAsync(10)
      await timeoutResult
      expect(then).toHaveBeenCalledTimes(1)
      const registrations = add.mock.calls.map(([listener]) => listener)
      expect(registrations).toHaveLength(2)
      expect(remove.mock.calls.map(([listener]) => listener)).toEqual(
        registrations
      )
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.restoreAllMocks()
      jest.useRealTimers()
    }
  })

  it.each([
    { baseURL: `${location.origin}/demo`, url: '/resource', gated: true },
    {
      baseURL: `${location.origin}/demo`,
      url: 'https://other.example/resource',
      gated: false
    },
    {
      baseURL: `${location.origin}/demo`,
      url: 'https://other.example/resource',
      allowAbsoluteUrls: false,
      gated: true
    },
    { baseURL: `${location.origin}/outside`, url: '/resource', gated: false },
    { url: '/demo/../outside', gated: false },
    { url: '/demo/resource?x=/outside', gated: true }
  ])('matches Axios URL resolution for $url', async ({ gated, ...options }) => {
    await expect(
      waitForMockReadiness(ready(Promise.resolve()), config(options))
    ).resolves.toBe(gated ? true : undefined)
  })

  it('removes cancel-token listeners and ignores readiness after cancellation', async () => {
    let release!: (value: unknown) => void
    const host = new Promise<unknown>((resolve) => {
      release = resolve
    })
    const source = axios.CancelToken.source()
    const unsubscribe = jest.spyOn(source.token, 'unsubscribe')
    const pending = waitForMockReadiness(
      ready(host),
      config({ cancelToken: source.token, timeout: 500 })
    )
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'ERR_CANCELED',
      message: 'stop'
    })
    source.cancel('stop')
    await rejected
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    release({ error: 'late failure' })
    await Promise.resolve()
  })

  it('accounts for elapsed time and broadcasts a shared host outcome', async () => {
    jest.useFakeTimers()
    try {
      let release!: (value: unknown) => void
      const host = new Promise<unknown>((resolve) => {
        release = resolve
      })
      const first = config({ timeout: 1000 })
      const second = config({ timeout: 800 })
      const waits = [
        waitForMockReadiness(ready(host), first),
        waitForMockReadiness(ready(host), second)
      ]
      await jest.advanceTimersByTimeAsync(200)
      release({})
      await expect(Promise.all(waits)).resolves.toEqual([true, true])
      expect(first.timeout).toBe(800)
      expect(second.timeout).toBe(600)
      expect(jest.getTimerCount()).toBe(0)
      await expect(waitForMockReadiness(ready(host), config())).resolves.toBe(
        true
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('preserves host rejection and fulfilled failure reporting for subsequent waits', async () => {
    const rejectedHost = Promise.reject(new Error('boot failed'))
    await expect(
      waitForMockReadiness(ready(rejectedHost), config())
    ).rejects.toThrow('Mock initialization failed: Error: boot failed')
    await expect(
      waitForMockReadiness(ready(rejectedHost), config())
    ).rejects.toThrow('Mock initialization failed: Error: boot failed')
    await expect(
      waitForMockReadiness(
        ready(Promise.resolve({ boot: { driveError: 'drive failed' } })),
        config()
      )
    ).rejects.toThrow('Mock initialization failed: drive failed')
  })

  it('unsubscribes abort listeners and timers after the host settles', async () => {
    jest.useFakeTimers()
    try {
      const controller = new AbortController()
      const add = jest.spyOn(controller.signal, 'addEventListener')
      const remove = jest.spyOn(controller.signal, 'removeEventListener')
      await expect(
        waitForMockReadiness(
          ready(Promise.resolve()),
          config({ signal: controller.signal, timeout: 500 })
        )
      ).resolves.toBe(true)
      expect(add).toHaveBeenCalledTimes(1)
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1])
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it.each([0, 120001])(
    'uses the 120 second bootstrap limit for timeout %i',
    async (timeout) => {
      jest.useFakeTimers()
      try {
        const pending = waitForMockReadiness(
          ready(new Promise(() => {})),
          config({ timeout })
        )
        const rejected = expect(pending).rejects.toMatchObject({
          name: 'MockReadinessError',
          message: 'Mock initialization timed out'
        })
        await jest.advanceTimersByTimeAsync(120000)
        await rejected
        expect(jest.getTimerCount()).toBe(0)
      } finally {
        jest.useRealTimers()
      }
    }
  )

  it('does not serialize query parameters when determining the target URL', async () => {
    const serialize = jest.fn(() => 'key=value')
    const request = config({
      params: { key: 'value' },
      paramsSerializer: { serialize }
    })
    await expect(
      waitForMockReadiness(ready(Promise.resolve()), request)
    ).resolves.toBe(true)
    expect(serialize).not.toHaveBeenCalled()
    expect(axios.getUri(request)).toContain('key=value')
    expect(serialize).toHaveBeenCalledTimes(1)
  })
})
