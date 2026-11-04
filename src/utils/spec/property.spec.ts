// Property tests over the pure parts of the adapter.
//
// These are not examples restated as a loop: each one states a rule that has to
// hold for every input, and fast-check searches for an input that breaks it and
// shrinks a failure to the smallest one. The rules below are the ones an example
// cannot state - `splitChunks` reassembles losslessly for every string, and
// `parseWeboutResponse` returns the payload unchanged or nothing at all, never
// part of it.
//
// scorecard's Fuzzing check detects an import of fast-check in the repository
// (checks/raw/fuzzing.go, v5.6.0), so this file is also what makes that check
// green. The check is a detector, not an audit - what it is worth is the
// invariants here, not the import line.
import fc from 'fast-check'
import { splitChunks } from '../splitChunks'
import { parseWeboutResponse } from '../parseWeboutResponse'

// the boundary splitChunks splits on
const CHUNK_SIZE = 16000

// fc.string() generates strings of at most ten characters by default, so a
// property driven by it never reaches a second chunk and would hold vacuously
// against a splitter that stopped splitting. These lengths straddle the boundary
// instead, and they are generated as numbers so a failing case shrinks to an
// integer rather than to a shorter string.
const chunkedLength = fc.oneof(
  fc.integer({ min: 0, max: 100 }),
  fc.integer({ min: CHUNK_SIZE - 1, max: CHUNK_SIZE * 2 + 1 })
)

describe('splitChunks', () => {
  it('reassembles every string without loss', () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        expect(splitChunks(content).join('')).toBe(content)
      })
    )
  })

  it('reassembles content that spans several chunks without loss', () => {
    fc.assert(
      fc.property(chunkedLength, (length) => {
        const content = 'x'.repeat(length)

        expect(splitChunks(content).join('')).toBe(content)
      })
    )
  })

  it('never returns a chunk longer than the chunk size', () => {
    fc.assert(
      fc.property(chunkedLength, (length) => {
        for (const chunk of splitChunks('x'.repeat(length))) {
          expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
        }
      })
    )
  })

  it('returns the number of chunks the content needs', () => {
    fc.assert(
      fc.property(chunkedLength, (length) => {
        expect(splitChunks('x'.repeat(length))).toHaveLength(
          Math.ceil(length / CHUNK_SIZE)
        )
      })
    )
  })

  it('splits on the boundary rather than near it', () => {
    // the three lengths the boundary itself can be reported against
    for (const length of [CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1]) {
      const content = 'x'.repeat(length)

      expect(splitChunks(content).join('')).toBe(content)
      expect(splitChunks(content)).toHaveLength(Math.ceil(length / CHUNK_SIZE))
    }
  })
})

describe('parseWeboutResponse', () => {
  // a payload drawn from characters that cannot form a marker, so the round trip
  // is well defined - and from the alphabet webout payloads actually carry
  const PAYLOAD_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789 \n\t-_/{}[]"'
  const payload = fc.string({
    unit: fc.constantFrom(...PAYLOAD_CHARS.split(''))
  })

  it('returns the payload between the markers unchanged', () => {
    fc.assert(
      fc.property(payload, (body) => {
        expect(parseWeboutResponse(`>>weboutBEGIN<<${body}>>weboutEND<<`)).toBe(
          body
        )
      })
    )
  })

  it('returns an empty string when there is no webout', () => {
    fc.assert(
      fc.property(fc.string(), (response) => {
        fc.pre(!response.includes('>>weboutBEGIN<<'))

        expect(parseWeboutResponse(response)).toBe('')
      })
    )
  })

  it('never throws, whatever the response holds', () => {
    fc.assert(
      fc.property(fc.string(), (response) => {
        expect(() => parseWeboutResponse(response)).not.toThrow()
      })
    )
  })
})
