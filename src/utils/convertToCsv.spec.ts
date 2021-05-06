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
})
