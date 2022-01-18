import { convertToCSV } from './convertToCsv'

describe('convertToCsv', () => {
  it('should convert single quoted values', () => {
    const data = [
      { foo: `'bar'`, bar: 'abc' },
      { foo: 'sadf', bar: 'def' },
      { foo: 'asd', bar: `'qwert'` }
    ]

    const expectedOutput = `foo:$char5. bar:$char7.\r\n"'bar'",abc\r\nsadf,def\r\nasd,"'qwert'"`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert double quoted values', () => {
    const data = [
      { foo: `"bar"`, bar: 'abc' },
      { foo: 'sadf', bar: 'def' },
      { foo: 'asd', bar: `"qwert"` }
    ]

    const expectedOutput = `foo:$char5. bar:$char7.\r\n"""bar""",abc\r\nsadf,def\r\nasd,"""qwert"""`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `'blah'`, bar: `"blah"` }]

    const expectedOutput = `foo:$char6. bar:$char6.\r\n"'blah'","""blah"""`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `'blah,"'`, bar: `"blah,blah" "` }]

    const expectedOutput = `foo:$char8. bar:$char13.\r\n"'blah,""'","""blah,blah"" """`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `',''`, bar: `","` }]

    const expectedOutput = `foo:$char4. bar:$char3.\r\n"',''",""","""`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `','`, bar: `,"` }]

    const expectedOutput = `foo:$char3. bar:$char2.\r\n"','",","""`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `"`, bar: `'` }]

    const expectedOutput = `foo:$char1. bar:$char1.\r\n"""","'"`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `,`, bar: `',` }]

    const expectedOutput = `foo:$char1. bar:$char2.\r\n",","',"`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with number cases 1', () => {
    const data = [
      { col1: 42, col2: null, col3: 'x', col4: null },
      { col1: 42, col2: null, col3: 'x', col4: null },
      { col1: 42, col2: null, col3: 'x', col4: null },
      { col1: 42, col2: null, col3: 'x', col4: '' },
      { col1: 42, col2: null, col3: 'x', col4: '' }
    ]

    const expectedOutput = `col1:best. col2:best. col3:$char1. col4:$char1.\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with number cases 2', () => {
    const data = [
      { col1: 42, col2: null, col3: 'x', col4: '' },
      { col1: 42, col2: null, col3: 'x', col4: '' },
      { col1: 42, col2: null, col3: 'x', col4: '' },
      { col1: 42, col2: 1.62, col3: 'x', col4: 'x' },
      { col1: 42, col2: 1.62, col3: 'x', col4: 'x' }
    ]

    const expectedOutput = `col1:best. col2:best. col3:$char1. col4:$char1.\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,\r\n42,1.62,x,x\r\n42,1.62,x,x`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with common special characters', () => {
    expect(convertToCSV([{ tab: '\t' }])).toEqual(`tab:$char1.\r\n\"\t\"`)
    expect(convertToCSV([{ lf: '\n' }])).toEqual(`lf:$char1.\r\n\"\n\"`)
    expect(convertToCSV([{ semicolon: ';semi' }])).toEqual(
      `semicolon:$char5.\r\n;semi`
    )
    expect(convertToCSV([{ percent: '%' }])).toEqual(`percent:$char1.\r\n%`)
    expect(convertToCSV([{ singleQuote: "'" }])).toEqual(
      `singleQuote:$char1.\r\n\"'\"`
    )
    expect(convertToCSV([{ doubleQuote: '"' }])).toEqual(
      `doubleQuote:$char1.\r\n""""`
    )
    expect(convertToCSV([{ crlf: '\r\n' }])).toEqual(`crlf:$char2.\r\n\"\n\"`)
    expect(convertToCSV([{ euro: '€euro' }])).toEqual(`euro:$char7.\r\n€euro`)
    expect(convertToCSV([{ banghash: '!#banghash' }])).toEqual(
      `banghash:$char10.\r\n!#banghash`
    )
  })

  it('should convert values with other special characters', () => {
    const data = [
      {
        speech0: '"speech',
        pct: '%percent',
        speech: '"speech',
        slash: '\\slash',
        slashWithSpecial: '\\\tslash',
        macvar: '&sysuserid',
        chinese: '传/傳chinese',
        sigma: 'Σsigma',
        at: '@at',
        serbian: 'Српски',
        dollar: '$'
      }
    ]

    const expectedOutput = `speech0:$char7. pct:$char8. speech:$char7. slash:$char6. slashWithSpecial:$char7. macvar:$char10. chinese:$char14. sigma:$char7. at:$char3. serbian:$char12. dollar:$char1.\r\n"""speech",%percent,"""speech",\\slash,\"\\\tslash\",&sysuserid,传/傳chinese,Σsigma,@at,Српски,$`

    expect(convertToCSV(data)).toEqual(expectedOutput)

    expect(convertToCSV([{ speech: 'menext' }])).toEqual(
      `speech:$char6.\r\nmenext`
    )
    expect(convertToCSV([{ speech: 'me\nnext' }])).toEqual(
      `speech:$char7.\r\n\"me\nnext\"`
    )
    expect(convertToCSV([{ speech: `me'next` }])).toEqual(
      `speech:$char7.\r\n\"me'next\"`
    )
    expect(convertToCSV([{ speech: `me"next` }])).toEqual(
      `speech:$char7.\r\n\"me""next\"`
    )
    expect(convertToCSV([{ speech: `me""next` }])).toEqual(
      `speech:$char8.\r\n\"me""""next\"`
    )
    expect(convertToCSV([{ slashWithSpecial: '\\\tslash' }])).toEqual(
      `slashWithSpecial:$char7.\r\n\"\\\tslash\"`
    )
    expect(convertToCSV([{ slashWithSpecial: '\\ \tslash' }])).toEqual(
      `slashWithSpecial:$char8.\r\n\"\\ \tslash\"`
    )
    expect(
      convertToCSV([{ slashWithSpecialExtra: '\\\ts\tl\ta\ts\t\th\t' }])
    ).toEqual(`slashWithSpecialExtra:$char13.\r\n\"\\\ts\tl\ta\ts\t\th\t\"`)
  })

  it('should console log error if data has mixed types', () => {
    const colName = 'var1'
    const data = [{ [colName]: 'string' }, { [colName]: 232 }]

    jest.spyOn(console, 'error').mockImplementation(() => {})

    convertToCSV(data)

    expect(console.error).toHaveBeenCalledWith(
      `Row (2), Column (${colName}) has mixed types: ERROR`
    )
  })
})
