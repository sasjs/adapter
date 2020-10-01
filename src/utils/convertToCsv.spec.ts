import { convertToCSV } from './index'

describe('convertToCsv', () => {
  it('should convert an empty array to CSV', () => {
    const data: any[] = []
    const expectedResult = ''

    const result = convertToCSV(data)

    expect(result).toEqual(expectedResult)
  })

  it('should convert a simple object to CSV', () => {
    const data: any[] = [{ foo: 'bar' }, { foo: 'baz' }]
    const expectedResult = `foo:$3.\r\nbar\r\nbaz`

    const result = convertToCSV(data)

    expect(result).toEqual(expectedResult)
  })

  it('should include the length of the longest value in the column header', () => {
    const data: any[] = [{ foo: 'bar' }, { foo: 'foobar' }]
    const expectedResult = `foo:$6.\r\nbar\r\nfoobar`

    const result = convertToCSV(data)

    expect(result).toEqual(expectedResult)
  })
})
