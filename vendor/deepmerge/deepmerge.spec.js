// Tests for the vendored deepmerge fork: the merge semantics jest-config depends
// on, and the poison payloads GHSA-gcqx-w48m-w2h4 describes.
const deepmerge = require('./index')

describe('vendored deepmerge: the semantics jest-config relies on', () => {
  it('merges nested objects without losing either side', () => {
    const merged = deepmerge(
      { globals: { a: 1 }, roots: ['src'] },
      { globals: { b: 2 }, testEnvironment: 'node' }
    )

    expect(merged).toEqual({
      globals: { a: 1, b: 2 },
      roots: ['src'],
      testEnvironment: 'node'
    })
  })

  it('concatenates arrays rather than replacing them', () => {
    expect(deepmerge({ roots: ['a'] }, { roots: ['b'] })).toEqual({
      roots: ['a', 'b']
    })
  })

  it('merges a list of configs, as deepmerge.all is used for', () => {
    expect(deepmerge.all([{ a: 1 }, { b: 2 }, { a: 3 }])).toEqual({ a: 3, b: 2 })
  })

  it('replaces one side outright when the types differ', () => {
    expect(deepmerge({ a: { b: 1 } }, { a: 'flat' })).toEqual({ a: 'flat' })
  })

  it('leaves the inputs alone', () => {
    const target = { nested: { a: 1 } }
    deepmerge(target, { nested: { b: 2 } })

    expect(target).toEqual({ nested: { a: 1 } })
  })
})

describe('vendored deepmerge: prototype poisoning', () => {
  const POLLUTED = JSON.parse('{"__proto__": {"polluted": "yes"}}')

  afterEach(() => {
    // a failed guard would leak through every later test in the file
    delete Object.prototype.polluted
    expect({}.polluted).toBeUndefined()
  })

  it('does not pollute Object.prototype from a source object', () => {
    const merged = deepmerge({ safe: true }, POLLUTED)

    expect(merged.safe).toBe(true)
    expect({}.polluted).toBeUndefined()
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
  })

  it('does not pollute through a target object that has no such key', () => {
    // the case 4.3.1 missed: Object.create(null) has nothing up its chain, so its
    // propertyIsUnsafe() returned false and the assignment hit the setter
    const target = Object.create(null)
    target.safe = true

    const merged = deepmerge(target, POLLUTED)

    expect(merged.safe).toBe(true)
    expect({}.polluted).toBeUndefined()
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
  })

  it('does not pollute through a target that carries the key itself', () => {
    const merged = deepmerge(POLLUTED, { safe: true })

    expect({}.polluted).toBeUndefined()
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
  })

  it('refuses constructor and prototype keys as well', () => {
    const payload = JSON.parse(
      '{"constructor": {"prototype": {"polluted": "yes"}}, "prototype": {"polluted": "yes"}}'
    )

    const merged = deepmerge({ safe: true }, payload)

    expect(merged.safe).toBe(true)
    expect({}.polluted).toBeUndefined()
    expect(Object.prototype.polluted).toBeUndefined()
  })

  it('refuses the keys in a nested merge too', () => {
    const merged = deepmerge({ nested: {} }, JSON.parse('{"nested": {"__proto__": {"polluted": "yes"}}}'))

    expect({}.polluted).toBeUndefined()
    expect(Object.getPrototypeOf(merged.nested)).toBe(Object.prototype)
  })
})
