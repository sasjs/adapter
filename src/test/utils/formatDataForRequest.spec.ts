import { formatDataForRequest } from '../../utils/formatDataForRequest'

describe('formatDataForRequest', () => {
  const testTable = 'sometable'

  it('should format table with special missing values', () => {
    const tableWithMissingValues = {
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

    expect(formatDataForRequest(tableWithMissingValues)).toEqual(expectedOutput)
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

  it('should throw an error if special missing values is not valid', () => {
    let tableWithMissingValues = {
      [testTable]: [{ var: 'AA' }, { var: 0 }],
      [`$${testTable}`]: { formats: { var: 'best.' } }
    }

    expect(() => formatDataForRequest(tableWithMissingValues)).toThrow(
      new Error(
        'A Special missing value can only be a single character from A to Z or _ or .[a-z] or ._'
      )
    )
  })

  it('should auto-detect special missing values type as best.', () => {
    const tableWithMissingValues = {
      [testTable]: [{ var: 'a' }, { var: 'A' }, { var: '_' }, { var: 0 }]
    }

    const expectedOutput = {
      sasjs1data: `var:best.\r\n.a\r\n.a\r\n._\r\n0`,
      sasjs_tables: testTable
    }

    expect(formatDataForRequest(tableWithMissingValues)).toEqual(expectedOutput)
  })

  it('should auto-detect values type as $char1.', () => {
    const tableWithMissingValues = {
      [testTable]: [{ var: 'a' }, { var: 'A' }, { var: '_' }]
    }

    const expectedOutput = {
      sasjs1data: `var:$char1.\r\na\r\nA\r\n_`,
      sasjs_tables: testTable
    }

    expect(formatDataForRequest(tableWithMissingValues)).toEqual(expectedOutput)
  })
})
