import type { Logger } from '@sasjs/utils/logger'
import { isNode } from './isNode'

/**
 * The logger a host attaches to `process`, or the console when there is none.
 *
 * The browser build injects a process stub into every module (webpack's
 * ProvidePlugin, browser-shims/process.js), so `process` is always defined and
 * `typeof process === 'undefined'` never distinguishes the environments.
 * `isNode()` reads `process.versions.node`, which the stub leaves undefined.
 * Every logger lookup goes through here so that the same source runs in both.
 */
export const getLogger = (): Logger | Console =>
  isNode() ? process.logger || console : console

/**
 * The working directory, or '.' where there is no node to ask - the browser
 * case. Only node paths call this, but the guard keeps the reference safe to
 * carry in a browser bundle.
 */
export const getCwd = (): string => (isNode() ? process.cwd() : '.')

/**
 * Pretty-prints a value for verbose logging. Node's util.inspect gives the
 * coloured output the CLI displays. A browser has no util module - the browser
 * build maps `util` to nothing, see resolve.alias in webpack.config.js - so
 * JSON is the fallback there rather than a bundled shim.
 */
export const inspectValue = (value: unknown, colors: boolean): string => {
  if (isNode()) {
    const { inspect } = require('util')

    return inspect(value, { colors })
  }

  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}
