import * as IsNodeModule from '../isNode'
import { getCwd, getLogger, inspectValue } from '../host'

describe('host', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    delete (process as any).logger
  })

  describe('in node', () => {
    beforeEach(() => {
      jest.spyOn(IsNodeModule, 'isNode').mockReturnValue(true)
    })

    it('returns the logger the host attached to process', () => {
      const logger = { info: jest.fn() }
      ;(process as any).logger = logger

      expect(getLogger()).toBe(logger)
    })

    it('falls back to the console when the host attached no logger', () => {
      expect(getLogger()).toBe(console)
    })

    it('returns the working directory', () => {
      expect(getCwd()).toBe(process.cwd())
    })

    it('prints values with util.inspect, which a browser has no equivalent of', () => {
      expect(inspectValue({ a: 1 }, false)).toBe('{ a: 1 }')
    })
  })

  describe('in a browser, where the bundle injects a process stub', () => {
    beforeEach(() => {
      jest.spyOn(IsNodeModule, 'isNode').mockReturnValue(false)
    })

    it('returns the console, since the stub carries no logger', () => {
      expect(getLogger()).toBe(console)
    })

    it('returns "." rather than reaching for a working directory', () => {
      expect(getCwd()).toBe('.')
    })

    it('prints objects as JSON, and strings as they are', () => {
      expect(inspectValue({ a: 1 }, false)).toBe('{\n  "a": 1\n}')
      expect(inspectValue('text', false)).toBe('text')
    })
  })
})
