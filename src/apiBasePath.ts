/**
 * Where the SASjs Server API is mounted.
 *
 * This is the one name the adapter needs for a SASjs Server, and it is the same
 * kind of value as `pathSASViya` - a single path that says where this server
 * type's endpoints live. Servers from the release that introduced the short
 * paths answer `/api` as well, and a project may prefer that spelling for what
 * it shows in a URL, a log or a network panel.
 */
export const DEFAULT_PATH_SASJS = '/SASjsApi'

/** The stored-program endpoint under that mount. Hard-coded, not configurable. */
export const STP_EXECUTE_SUFFIX = '/stp/execute'

/** The mount used by the URL builders when no config reaches them. */
export const DEFAULT_API_BASE_PATH = DEFAULT_PATH_SASJS

/**
 * A base path the URL builders can concatenate with confidence: one leading
 * slash, no trailing one. `SASjsApi`, `/SASjsApi/` and ` /SASjsApi ` all mean
 * the same mount, and a trailing slash here would double up in every path.
 */
export const normaliseApiBasePath = (path?: string): string => {
  const raw = (path || '').trim()

  // Absent and empty mean the default. A value of only slashes is the root
  // mount, and is a real deployment - a proxy that puts the API at the origin -
  // so the two are separated before the runs are stripped, or both would fold
  // into the default.
  if (!raw) return DEFAULT_PATH_SASJS

  // Scanned rather than matched with /^\/+|\/+$/ : a run of slashes makes that
  // pattern backtrack, which is the kind of input a config value can carry by
  // accident, and CodeQL flags it.
  let first = 0

  while (first < raw.length && raw.charAt(first) === '/') first++

  let last = raw.length

  while (last > first && raw.charAt(last - 1) === '/') last--

  const middle = raw.slice(first, last)

  return middle ? `/${middle}` : '/'
}

/**
 * The mount as callers concatenate it.
 *
 * A root mount contributes nothing, so a URL built as
 * `${serverUrl}${apiBasePrefix(base)}/session` is `https://host/session` rather
 * than `https://host//session`. Every place that composes a path by hand uses
 * this, because a doubled slash is a different URL to a proxy.
 */
export const apiBasePrefix = (base?: string): string =>
  normaliseApiBasePath(base) === '/' ? '' : normaliseApiBasePath(base)

/**
 * The mount, read from `pathSASJS`.
 *
 * `pathSASJS` names the mount itself (`/SASjsApi`, `/api`); the stored-program
 * endpoint under it is `/stp/execute` and is appended by the code that calls it,
 * so there is one place a stub path can be got wrong instead of a config value
 * that has to agree with it.
 *
 * A value carrying the endpoint - `/api/stp/execute` - is accepted and read as
 * the mount it names, because that spelling appears in earlier documentation and
 * in bookmarks, and the two mean the same server.
 */
export const apiBaseFromPathSASJS = (pathSASJS?: string): string => {
  const base = normaliseApiBasePath(pathSASJS)

  if (base.endsWith(STP_EXECUTE_SUFFIX))
    return base.slice(0, -STP_EXECUTE_SUFFIX.length) || '/'

  return base
}
