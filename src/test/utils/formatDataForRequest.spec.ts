import { formatDataForRequest } from '../../utils/formatDataForRequest'

describe('formatDataForRequest', () => {
  const testTable = 'sometable'

  it('should', () => {
    const testTableWithNullVars = {
      [testTable]: [
        { var1: 'string', var2: 232, nullvar: 'A' },
        { var1: 'string', var2: 232, nullvar: 'B' },
        { var1: 'string', var2: 232, nullvar: '_' },
        { var1: 'string', var2: 232, nullvar: 0 },
        { var1: 'string', var2: 232, nullvar: 'z' },
        { var1: 'string', var2: 232, nullvar: null }
      ],
      [`$${testTable}`]: { formats: { var1: '$char12.', nullvar: 'best.' } }
    }

    const expectedOutput = {
      sasjs1data: `var1:$char12. var2:best. nullvar:best.\r\nstring,232,.a\r\nstring,232,.b\r\nstring,232,._\r\nstring,232,0\r\nstring,232,.z\r\nstring,232,.`,
      sasjs_tables: testTable
    }

    expect(formatDataForRequest(testTableWithNullVars)).toEqual(expectedOutput)
  })

  it('should return error if string is more than 32765 characters', () => {
    const data = { testTable: [{ var1: 'z'.repeat(32765 + 1) }] }

    expect(() => formatDataForRequest(data)).toThrow(
      new Error(
        'The max length of a string value in SASjs is 32765 characters.'
      )
    )
  })

  it('should return error if string is more than 32765 characters', () => {
    const charsCount = 16 * 1000 + 1
    const allChars = 'z'.repeat(charsCount)
    const data = { [testTable]: [{ var1: allChars }] }
    const firstChunk = `var1:$char${charsCount}.\r\n`
    const firstChunkChars = 'z'.repeat(16000 - firstChunk.length)
    const secondChunkChars = 'z'.repeat(
      charsCount - (16000 - firstChunk.length)
    )

    const expectedOutput = {
      sasjs1data0: 2,
      sasjs1data1: `${firstChunk}${firstChunkChars}`,
      sasjs1data2: secondChunkChars,
      sasjs_tables: testTable
    }

    expect(formatDataForRequest(data)).toEqual(expectedOutput)
  })
})
