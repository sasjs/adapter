// The browser build has no process object, and code in the bundle reads it:
// readable-stream reads process.nextTick, util-deprecate reads process.env and
// the deprecation flags, and a bundled `asap` helper falls back to
// process.nextTick when queueMicrotask is missing. @sasjs/utils reads
// process.platform too, though it guards that read itself.
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
