import axios, {
  AxiosInstance,
  CanceledError,
  InternalAxiosRequestConfig
} from 'axios'
import { MockReadinessError } from '../types/errors/MockReadinessError'

interface MockReadiness {
  promise: Promise<unknown>
  scope: URL
}

export const captureMockReadiness = (): MockReadiness | undefined => {
  if (typeof window === 'undefined') return undefined
  const ready = (window as any).__sasjsMockReady
  if (!ready || typeof ready.then !== 'function') return undefined
  const promise = Promise.resolve(ready)
  promise.catch(() => {})
  const boot = Array.from(document.scripts).find((script) => {
    try {
      return new URL(script.src, window.location.href).pathname.endsWith(
        '/host/boot.js'
      )
    } catch {
      return false
    }
  })
  const scope = boot
    ? new URL('../', boot.src)
    : new URL('/', window.location.href)
  return { promise, scope }
}

type ReadinessListener = (value: unknown, failed: boolean) => void

interface ReadinessHub {
  subscribe: (listener: ReadinessListener) => () => void
}

// Native promises cannot unsubscribe reactions. Attach only one reaction per
// host promise, and keep removable per-request listeners in a separate hub.
const readinessHubs = new WeakMap<Promise<unknown>, ReadinessHub>()

const getReadinessHub = (promise: Promise<unknown>): ReadinessHub => {
  const existing = readinessHubs.get(promise)
  if (existing) return existing

  const listeners = new Set<ReadinessListener>()
  let outcome: { value: unknown; failed: boolean } | undefined
  const settle = (value: unknown, failed: boolean) => {
    outcome = { value, failed }
    for (const listener of listeners) listener(value, failed)
    listeners.clear()
  }
  const hub: ReadinessHub = {
    subscribe: (listener) => {
      if (outcome) {
        const settled = outcome
        Promise.resolve().then(() => listener(settled.value, settled.failed))
        return () => {}
      }
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
  readinessHubs.set(promise, hub)
  promise.then(
    (value) => settle(value, false),
    (error) => settle(error, true)
  )
  return hub
}

// Install the gate after the user's transforms: a transform may replace the
// adapter or the URL, and Axios chooses its adapter only after transforming.
export const installMockReadinessGate = (
  client: AxiosInstance,
  ready: MockReadiness
) => {
  client.interceptors.request.use(
    (config) => {
      // The adapter fallback survives a later interceptor replacing the entire
      // transform list. The final transform below also covers transforms that
      // deliberately select a different adapter.
      let fallback: any
      const wrapAdapter = (selected: any) => {
        if (selected === fallback && fallback) return fallback
        return (dispatched: InternalAxiosRequestConfig) => {
          const adapter = (axios.getAdapter as any)(selected, dispatched)
          if (!isMockTarget(ready, dispatched)) return adapter(dispatched)
          const browserTransport = isBrowserTransport(adapter, dispatched)
          if (browserTransport) preserveBrowserXsrf(dispatched)
          if (
            browserTransport &&
            typeof FormData !== 'undefined' &&
            dispatched.data instanceof FormData &&
            typeof dispatched.data.entries === 'function'
          ) {
            const snapshot = new FormData()
            for (const [name, value] of dispatched.data.entries()) {
              snapshot.append(name, value)
            }
            dispatched.data = snapshot
          } else if (
            browserTransport &&
            dispatched.data instanceof ArrayBuffer
          ) {
            dispatched.data = dispatched.data.slice(0)
          }
          return waitForMockReadiness(ready, dispatched).then(() => {
            dispatched.cancelToken?.throwIfRequested()
            if (dispatched.signal?.aborted)
              throw new CanceledError('canceled', dispatched)
            return adapter(dispatched)
          })
        }
      }
      const selected =
        config.adapter || client.defaults.adapter || axios.defaults.adapter
      fallback = wrapAdapter(selected)
      config.adapter = fallback
      const transforms = config.transformRequest
      const original =
        transforms == null
          ? []
          : Array.isArray(transforms)
            ? transforms
            : [transforms]
      config.transformRequest = [
        ...original,
        function (this: InternalAxiosRequestConfig, data: any) {
          const selected =
            this.adapter || client.defaults.adapter || axios.defaults.adapter
          this.adapter = wrapAdapter(selected)
          return data
        }
      ]
      return config
    },
    undefined,
    { synchronous: true }
  )
}

// Resolve the same public Axios adapters rather than guessing from function names.
const isBrowserTransport = (
  adapter: unknown,
  config: InternalAxiosRequestConfig
) => {
  for (const name of ['xhr', 'fetch']) {
    try {
      if ((axios.getAdapter as any)(name, config) === adapter) return true
    } catch {
      // An adapter may be unavailable in this environment.
    }
  }
  return false
}

// Axios resolves XSRF at transport time. Freeze its decision only for its own
// browser transports; a custom adapter must continue to receive unmodified config.
const preserveBrowserXsrf = (config: InternalAxiosRequestConfig) => {
  const decision = config.withXSRFToken
  const { xsrfCookieName, xsrfHeaderName } = config
  let value: string | undefined
  if (xsrfCookieName && xsrfHeaderName) {
    const pair = document.cookie
      .split(';')
      .map((part) => part.replace(/^\s+/, ''))
      .find((part) => part.slice(0, part.indexOf('=')) === xsrfCookieName)
    if (pair) {
      value = pair.slice(pair.indexOf('=') + 1)
      try {
        value = decodeURIComponent(value)
      } catch {
        /* Axios accepts malformed encoding verbatim. */
      }
    }
  }
  // Compare actual transport origins, not Axios's location-relative XSRF check:
  // a document <base> can change while the request is waiting.
  const initialOrigin = new URL(
    axios.getUri({ ...config, params: null }),
    document.baseURI
  ).origin
  const targetChanged = (url: string) => {
    const origin = new URL(url, document.baseURI).origin
    return origin !== initialOrigin && origin !== location.origin
  }
  config.withXSRFToken = (resolved) => {
    // Axios serializes the URL before calling its policy and retains this
    // headers reference if the callback replaces resolved.headers.
    const headers = resolved.headers
    const result =
      typeof decision === 'function' ? decision(resolved) : decision
    const target = new URL(resolved.url || '', location.href)
    if (
      (result === true ||
        (result == null && target.origin === location.origin)) &&
      value &&
      xsrfHeaderName &&
      !targetChanged(resolved.url || '')
    )
      headers.set(xsrfHeaderName, value)
    return false
  }
}

const isMockTarget = (
  ready: MockReadiness | undefined,
  config: InternalAxiosRequestConfig
): boolean => {
  if (!ready || typeof window === 'undefined') return false
  // Query serialization belongs to the actual transport, not scope detection.
  const target = new URL(
    axios.getUri({ ...config, params: null }),
    document.baseURI
  )
  return (
    target.origin === ready.scope.origin &&
    target.pathname.startsWith(ready.scope.pathname)
  )
}

export const waitForMockReadiness = async (
  ready: MockReadiness | undefined,
  config: InternalAxiosRequestConfig
) => {
  if (!ready || !isMockTarget(ready, config)) return
  let result: unknown
  try {
    result = await new Promise((resolve, reject) => {
      const signal = config.signal
      const cancelToken = config.cancelToken
      let unsubscribeReadiness = () => {}
      let finished = false
      const cleanup = () => {
        finished = true
        unsubscribeReadiness()
        clearTimeout(timer)
        signal?.removeEventListener?.('abort', onAbort)
        cancelToken?.unsubscribe(onCancel)
      }
      const onAbort = () => {
        cleanup()
        reject(new CanceledError('canceled', config))
      }
      const onCancel = (reason: CanceledError<unknown>) => {
        cleanup()
        reject(reason)
      }
      const timeout =
        typeof config.timeout === 'number' && config.timeout > 0
          ? config.timeout
          : 0
      const started = Date.now()
      const timer = setTimeout(
        () => {
          cleanup()
          if (timeout && timeout <= 120000) {
            reject(
              new MockReadinessError(
                `timeout of ${timeout}ms exceeded while waiting for mock initialization`,
                'ECONNABORTED'
              )
            )
          } else {
            reject(new MockReadinessError('Mock initialization timed out'))
          }
        },
        timeout ? Math.min(timeout, 120000) : 120000
      )
      if (signal?.aborted) return onAbort()
      signal?.addEventListener?.('abort', onAbort)
      cancelToken?.subscribe(onCancel)
      if (finished) return
      unsubscribeReadiness = getReadinessHub(ready.promise).subscribe(
        (value, failed) => {
          if (finished) return
          cleanup()
          if (failed) {
            reject(value)
          } else {
            if (timeout)
              config.timeout = Math.max(1, timeout - (Date.now() - started))
            resolve(value)
          }
        }
      )
    })
  } catch (error) {
    if (error instanceof CanceledError || error instanceof MockReadinessError)
      throw error
    throw new MockReadinessError(`Mock initialization failed: ${String(error)}`)
  }
  if (result && typeof result === 'object') {
    const value = result as {
      error?: unknown
      driveError?: unknown
      boot?: { driveError?: unknown }
    }
    const failure = value.error || value.driveError || value.boot?.driveError
    if (failure)
      throw new MockReadinessError(
        `Mock initialization failed: ${String(failure)}`
      )
  }
  return true
}
