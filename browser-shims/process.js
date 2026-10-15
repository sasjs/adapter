// The browser build has no process object, and code in the bundle reads it:
// @sasjs/utils/formatter/regexp.js reads process.platform to pick a line
// ending, readable-stream reads process.nextTick, and util-deprecate reads
// process.env and the deprecation flags.
//
// This stub answers those reads. It replaces the Node stdlib polyfill tree the
// browser build used to bundle, which carried thousands of lines of shimmed
// Node internals in the package to answer a handful of property reads.
//
// `versions` stays empty on purpose: isNode() reads process.versions.node, so
// an empty object keeps the node-only code paths switched off in a browser.
module.exports = {
  env: {},
  platform: 'browser',
  argv: [],
  version: '',
  versions: {},
  pid: 0,
  cwd: () => '.',
  nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0),
  noDeprecation: false,
  throwDeprecation: false,
  traceDeprecation: false,
  on: () => {},
  once: () => {},
  emit: () => {},
  removeListener: () => {},
  listeners: () => []
}
