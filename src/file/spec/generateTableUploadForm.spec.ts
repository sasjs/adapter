import { generateTableUploadForm } from '../generateTableUploadForm'
import { convertToCSV } from '../../utils/convertToCsv'
import NodeFormData from 'form-data'

describe('generateTableUploadForm', () => {
  it('should skip formats table and emit single sasjs1data for paired data + $data', () => {
    const tableName = 'jsdata'
    const data: { [key: string]: any } = {
      [tableName]: [
        { var1: 'string', var2: 232 },
        { var1: 'string', var2: 233 }
      ],
      [`$${tableName}`]: { formats: { var1: '$char12.', var2: 'best.' } }
    }
    const expectedCsv = convertToCSV(data, tableName)

    const formData = new NodeFormData()
    const { requestParams } = generateTableUploadForm(formData, data)

    expect(requestParams.sasjs_tables).toBe(tableName)
    expect(requestParams.sasjs1data).toBe(expectedCsv)
    expect(requestParams.sasjs2data).toBeUndefined()
  })

  it('should number sequentially across multiple tables w/ paired formats', () => {
    const data: { [key: string]: any } = {
      tableA: [{ a: 1 }],
      $tableA: { formats: { a: 'best.' } },
      tableB: [{ b: 'x' }],
      $tableB: { formats: { b: '$char1.' } }
    }
    const expectedCsvA = convertToCSV(data, 'tableA')
    const expectedCsvB = convertToCSV(data, 'tableB')

    const formData = new NodeFormData()
    const { requestParams } = generateTableUploadForm(formData, data)

    expect(requestParams.sasjs_tables).toBe('tableA tableB')
    expect(requestParams.sasjs1data).toBe(expectedCsvA)
    expect(requestParams.sasjs2data).toBe(expectedCsvB)
    expect(requestParams.sasjs3data).toBeUndefined()
  })

  it('should throw if string value exceeds 32765 chars', () => {
    const formData = new NodeFormData()
    const data = { testTable: [{ var1: 'z'.repeat(32766) }] }

    expect(() => generateTableUploadForm(formData, data)).toThrow(
      new Error(
        'The max length of a string value in SASjs is 32765 characters.'
      )
    )
  })

  it('should append chunks to formData when csv exceeds 16k', () => {
    const tableName = 'big'
    const data = { [tableName]: [{ var1: 'z'.repeat(16001) }] }

    const formData = new NodeFormData()
    const appendSpy = jest.spyOn(formData, 'append')

    const { requestParams } = generateTableUploadForm(formData, data)

    expect(requestParams.sasjs_tables).toBe(tableName)
    expect(requestParams.sasjs1data).toBeUndefined()
    expect(appendSpy).toHaveBeenCalled()
    expect(appendSpy.mock.calls.every(([key]) => key === 'sasjs1data')).toBe(
      true
    )
  })
})
