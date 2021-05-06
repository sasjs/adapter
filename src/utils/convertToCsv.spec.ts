import { convertToCSV } from './convertToCsv'

describe('convertToCsv', () => {
  it('should convert single quoted values', () => {
    const data = [
      { foo: `'bar'`, bar: 'abc' },
      { foo: 'sadf', bar: 'def' },
      { foo: 'asd', bar: `'qwert'` }
    ]

    const expectedOutput = `foo:$5. bar:$7.\r\n"'bar'",abc\r\nsadf,def\r\nasd,"'qwert'"`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert double quoted values', () => {
    const data = [
      { foo: `"bar"`, bar: 'abc' },
      { foo: 'sadf', bar: 'def' },
      { foo: 'asd', bar: `"qwert"` }
    ]

    const expectedOutput = `foo:$5. bar:$7.\r\n"""bar""",abc\r\nsadf,def\r\nasd,"""qwert"""`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `'blah'`, bar: `"blah"` }]

    const expectedOutput = `foo:$6. bar:$6.\r\n"'blah'","""blah"""`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `'blah,"'`, bar: `"blah,blah" "` }]

    const expectedOutput = `foo:$8. bar:$13.\r\n"'blah,""'","""blah,blah"" """`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })
})
