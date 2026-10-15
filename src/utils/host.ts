import type { Logger } from '@sasjs/utils/logger'

/**
 * The logger a host attaches to `process`, or the console when there is none.
 *
 * The browser build has no process object at all, so reading `process.logger`
 * directly throws a ReferenceError there. Every logger lookup goes through
 * here so that the same source runs in both environments.
 */
export const getLogger = (): Logger | Console => {
  const hostProcess = typeof process === 'undefined' ? undefined : process

  return hostProcess?.logger || console
}

/**
 * The working directory, or '.' where there is no process to ask - the browser
 * case. Only node paths call this, but the guard keeps the reference safe to
 * carry in a browser bundle.
 */
export const getCwd = (): string =>
  typeof process === 'undefined' ? '.' : process.cwd()

/**
 * Pretty-prints a value for verbose logging. Node's util.inspect gives the
 * coloured output the CLI displays; a browser has no util module, so JSON is
 * the fallback there rather than a bundled shim.
 */
export const inspectValue = (value: unknown, colors: boolean): string => {
  if (typeof process !== 'undefined') {
    const { inspect } = require('util')

    return inspect(value, { colors })
  }

  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}
