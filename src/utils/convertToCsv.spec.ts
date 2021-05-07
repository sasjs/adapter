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

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `',''`, bar: `","` }]

    const expectedOutput = `foo:$4. bar:$3.\r\n"',''",""","""`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `','`, bar: `,"` }]

    const expectedOutput = `foo:$3. bar:$2.\r\n"','",","""`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `"`, bar: `'` }]

    const expectedOutput = `foo:$1. bar:$1.\r\n"""","'"`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = [{ foo: `,`, bar: `',` }]

    const expectedOutput = `foo:$1. bar:$2.\r\n",","',"`

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

    const expectedOutput = `col1:best. col2:best. col3:$1. col4:$1.\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,`

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

    const expectedOutput = `col1:best. col2:best. col3:$1. col4:$1.\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,\r\n42,1.62,x,x\r\n42,1.62,x,x`

    expect(convertToCSV(data)).toEqual(expectedOutput)
  })

  it('should convert values with common special characters', () => {
    expect(convertToCSV([{ tab: '\t' }])).toEqual(`tab:$1.\r\n\"\t\"`)
    expect(convertToCSV([{ lf: '\n' }])).toEqual(`lf:$1.\r\n\"\n\"`)
    expect(convertToCSV([{ semicolon: ';semi' }])).toEqual(
      `semicolon:$5.\r\n;semi`
    )
    expect(convertToCSV([{ percent: '%' }])).toEqual(`percent:$1.\r\n%`)
    expect(convertToCSV([{ singleQuote: "'" }])).toEqual(
      `singleQuote:$1.\r\n\"'\"`
    )
    expect(convertToCSV([{ doubleQuote: '"' }])).toEqual(
      `doubleQuote:$1.\r\n""""`
    )
    expect(convertToCSV([{ crlf: '\r\n' }])).toEqual(`crlf:$2.\r\n\"\n\"`)
    expect(convertToCSV([{ euro: '€euro' }])).toEqual(`euro:$7.\r\n€euro`)
    expect(convertToCSV([{ banghash: '!#banghash' }])).toEqual(
      `banghash:$10.\r\n!#banghash`
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

    const expectedOutput = `speech0:$7. pct:$8. speech:$7. slash:$6. slashWithSpecial:$7. macvar:$10. chinese:$14. sigma:$7. at:$3. serbian:$12. dollar:$1.\r\n"""speech",%percent,"""speech",\\slash,\"\\\tslash\",&sysuserid,传/傳chinese,Σsigma,@at,Српски,$`

    expect(convertToCSV(data)).toEqual(expectedOutput)

    expect(convertToCSV([{ speech: 'menext' }])).toEqual(`speech:$6.\r\nmenext`)
    expect(convertToCSV([{ speech: 'me\nnext' }])).toEqual(
      `speech:$7.\r\n\"me\nnext\"`
    )
    expect(convertToCSV([{ speech: `me'next` }])).toEqual(
      `speech:$7.\r\n\"me'next\"`
    )
    expect(convertToCSV([{ speech: `me"next` }])).toEqual(
      `speech:$7.\r\n\"me""next\"`
    )
    expect(convertToCSV([{ speech: `me""next` }])).toEqual(
      `speech:$8.\r\n\"me""""next\"`
    )
    expect(convertToCSV([{ slashWithSpecial: '\\\tslash' }])).toEqual(
      `slashWithSpecial:$7.\r\n\"\\\tslash\"`
    )
    expect(convertToCSV([{ slashWithSpecial: '\\ \tslash' }])).toEqual(
      `slashWithSpecial:$8.\r\n\"\\ \tslash\"`
    )
    expect(
      convertToCSV([{ slashWithSpecialExtra: '\\\ts\tl\ta\ts\t\th\t' }])
    ).toEqual(`slashWithSpecialExtra:$13.\r\n\"\\\ts\tl\ta\ts\t\th\t\"`)
  })
})
