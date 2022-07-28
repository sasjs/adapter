import { convertToCSV, isFormatsTable } from '../convertToCsv'

describe('convertToCsv', () => {
  const tableName = 'testTable'

  it('should convert single quoted values', () => {
    const data = {
      [tableName]: [
        { foo: `'bar'`, bar: 'abc' },
        { foo: 'sadf', bar: 'def' },
        { foo: 'asd', bar: `'qwert'` }
      ]
    }

    const expectedOutput = `foo:$char5. bar:$char7.\r\n"'bar'",abc\r\nsadf,def\r\nasd,"'qwert'"`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)
  })

  it('should convert double quoted values', () => {
    const data = {
      [tableName]: [
        { foo: `"bar"`, bar: 'abc' },
        { foo: 'sadf', bar: 'def' },
        { foo: 'asd', bar: `"qwert"` }
      ]
    }

    const expectedOutput = `foo:$char5. bar:$char7.\r\n"""bar""",abc\r\nsadf,def\r\nasd,"""qwert"""`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = { [tableName]: [{ foo: `'blah'`, bar: `"blah"` }] }

    const expectedOutput = `foo:$char6. bar:$char6.\r\n"'blah'","""blah"""`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = { [tableName]: [{ foo: `'blah,"'`, bar: `"blah,blah" "` }] }

    const expectedOutput = `foo:$char8. bar:$char13.\r\n"'blah,""'","""blah,blah"" """`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = { [tableName]: [{ foo: `',''`, bar: `","` }] }

    const expectedOutput = `foo:$char4. bar:$char3.\r\n"',''",""","""`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = { [tableName]: [{ foo: `','`, bar: `,"` }] }

    const expectedOutput = `foo:$char3. bar:$char2.\r\n"','",","""`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = { [tableName]: [{ foo: `"`, bar: `'` }] }

    const expectedOutput = `foo:$char1. bar:$char1.\r\n"""","'"`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)
  })

  it('should convert values with mixed quotes', () => {
    const data = { [tableName]: [{ foo: `,`, bar: `',` }] }

    const expectedOutput = `foo:$char1. bar:$char2.\r\n",","',"`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)
  })

  it('should convert values with number cases 1', () => {
    const data = {
      [tableName]: [
        { col1: 42, col2: null, col3: 'x', col4: null },
        { col1: 42, col2: null, col3: 'x', col4: null },
        { col1: 42, col2: null, col3: 'x', col4: null },
        { col1: 42, col2: null, col3: 'x', col4: '' },
        { col1: 42, col2: null, col3: 'x', col4: '' }
      ]
    }

    const expectedOutput = `col1:best. col2:best. col3:$char1. col4:$char1.\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)
  })

  it('should convert values with number cases 2', () => {
    const data = {
      [tableName]: [
        { col1: 42, col2: null, col3: 'x', col4: '' },
        { col1: 42, col2: null, col3: 'x', col4: '' },
        { col1: 42, col2: null, col3: 'x', col4: '' },
        { col1: 42, col2: 1.62, col3: 'x', col4: 'x' },
        { col1: 42, col2: 1.62, col3: 'x', col4: 'x' }
      ]
    }

    const expectedOutput = `col1:best. col2:best. col3:$char1. col4:$char1.\r\n42,.,x,\r\n42,.,x,\r\n42,.,x,\r\n42,1.62,x,x\r\n42,1.62,x,x`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)
  })

  it('should convert values with common special characters', () => {
    expect(convertToCSV({ [tableName]: [{ tab: '\t' }] }, tableName)).toEqual(
      `tab:$char1.\r\n\"\t\"`
    )
    expect(convertToCSV({ [tableName]: [{ lf: '\n' }] }, tableName)).toEqual(
      `lf:$char1.\r\n\"\n\"`
    )
    expect(
      convertToCSV({ [tableName]: [{ semicolon: ';semi' }] }, tableName)
    ).toEqual(`semicolon:$char5.\r\n;semi`)
    expect(
      convertToCSV({ [tableName]: [{ percent: '%' }] }, tableName)
    ).toEqual(`percent:$char1.\r\n%`)
    expect(
      convertToCSV({ [tableName]: [{ singleQuote: "'" }] }, tableName)
    ).toEqual(`singleQuote:$char1.\r\n\"'\"`)
    expect(
      convertToCSV({ [tableName]: [{ doubleQuote: '"' }] }, tableName)
    ).toEqual(`doubleQuote:$char1.\r\n""""`)
    expect(
      convertToCSV({ [tableName]: [{ crlf: '\r\n' }] }, tableName)
    ).toEqual(`crlf:$char2.\r\n\"\n\"`)
    expect(
      convertToCSV({ [tableName]: [{ euro: '€euro' }] }, tableName)
    ).toEqual(`euro:$char7.\r\n€euro`)
    expect(
      convertToCSV({ [tableName]: [{ banghash: '!#banghash' }] }, tableName)
    ).toEqual(`banghash:$char10.\r\n!#banghash`)
  })

  it('should convert values with other special characters', () => {
    const data = {
      [tableName]: [
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
    }

    const expectedOutput = `speech0:$char7. pct:$char8. speech:$char7. slash:$char6. slashWithSpecial:$char7. macvar:$char10. chinese:$char14. sigma:$char7. at:$char3. serbian:$char12. dollar:$char1.\r\n"""speech",%percent,"""speech",\\slash,\"\\\tslash\",&sysuserid,传/傳chinese,Σsigma,@at,Српски,$`

    expect(convertToCSV(data, tableName)).toEqual(expectedOutput)

    expect(
      convertToCSV({ [tableName]: [{ speech: 'menext' }] }, tableName)
    ).toEqual(`speech:$char6.\r\nmenext`)
    expect(
      convertToCSV({ [tableName]: [{ speech: 'me\nnext' }] }, tableName)
    ).toEqual(`speech:$char7.\r\n\"me\nnext\"`)
    expect(
      convertToCSV({ [tableName]: [{ speech: `me'next` }] }, tableName)
    ).toEqual(`speech:$char7.\r\n\"me'next\"`)
    expect(
      convertToCSV({ [tableName]: [{ speech: `me"next` }] }, tableName)
    ).toEqual(`speech:$char7.\r\n\"me""next\"`)
    expect(
      convertToCSV({ [tableName]: [{ speech: `me""next` }] }, tableName)
    ).toEqual(`speech:$char8.\r\n\"me""""next\"`)
    expect(
      convertToCSV(
        { [tableName]: [{ slashWithSpecial: '\\\tslash' }] },
        tableName
      )
    ).toEqual(`slashWithSpecial:$char7.\r\n\"\\\tslash\"`)
    expect(
      convertToCSV(
        { [tableName]: [{ slashWithSpecial: '\\ \tslash' }] },
        tableName
      )
    ).toEqual(`slashWithSpecial:$char8.\r\n\"\\ \tslash\"`)
    expect(
      convertToCSV(
        { [tableName]: [{ slashWithSpecialExtra: '\\\ts\tl\ta\ts\t\th\t' }] },
        tableName
      )
    ).toEqual(`slashWithSpecialExtra:$char13.\r\n\"\\\ts\tl\ta\ts\t\th\t\"`)
  })

  it('should console log error if data has mixed types', () => {
    const colName = 'var1'
    const data = { [tableName]: [{ [colName]: 'string' }, { [colName]: 232 }] }

    jest.spyOn(console, 'error').mockImplementation(() => {})

    convertToCSV(data, tableName)

    expect(console.error).toHaveBeenCalledWith(
      `Row (2), Column (${colName}) has mixed types: ERROR`
    )
  })

  it('should throw an error if table was not found in data object', () => {
    const data = { [tableName]: [{ var1: 'string' }] }

    expect(() => convertToCSV(data, 'wrongTableName')).toThrow(
      new Error(
        'Error while converting to CSV. No table provided to be converted to CSV.'
      )
    )
  })

  it('should empty string if table is not an array', () => {
    const data = { [tableName]: true }

    expect(convertToCSV(data, tableName)).toEqual('')
  })
})

describe('isFormatsTable', () => {
  const tableName = 'sometable'

  it('should return true if table name match pattern of formats table', () => {
    expect(isFormatsTable(`$${tableName}`)).toEqual(true)
  })

  it('should return false if table  name does not match pattern of formats table', () => {
    expect(isFormatsTable(tableName)).toEqual(false)
  })
})
