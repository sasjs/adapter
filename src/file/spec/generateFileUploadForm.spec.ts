import { generateFileUploadForm } from '../generateFileUploadForm'
import { convertToCSV } from '../../utils/convertToCsv'
import NodeFormData from 'form-data'
import * as isNodeModule from '../../utils/isNode'

describe('generateFileUploadForm', () => {
  beforeAll(() => {
    function FormDataMock(this: any) {
      this.append = () => {}
    }

    const BlobMock = jest.fn()
    ;(global as any).FormData = FormDataMock
    ;(global as any).Blob = BlobMock
  })

  describe('browser', () => {
    afterAll(() => {
      jest.restoreAllMocks()
    })

    it('should generate file upload form from data', () => {
      const formData = new FormData()
      const testTable = 'sometable'
      const testTableWithNullVars: { [key: string]: any } = {
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
      const tableName = Object.keys(testTableWithNullVars).filter(
        (key: string) => Array.isArray(testTableWithNullVars[key])
      )[0]

      jest.spyOn(formData, 'append').mockImplementation(() => {})
      jest.spyOn(isNodeModule, 'isNode').mockImplementation(() => false)

      generateFileUploadForm(formData, testTableWithNullVars)

      expect(formData.append).toHaveBeenCalledOnce()
      expect(formData.append).toHaveBeenCalledWith(
        tableName,
        {},
        `${tableName}.csv`
      )
    })

    it('should throw an error if too large string was provided', () => {
      const formData = new FormData()
      const data = { testTable: [{ var1: 'z'.repeat(32765 + 1) }] }

      expect(() => generateFileUploadForm(formData, data)).toThrow(
        new Error(
          'The max length of a string value in SASjs is 32765 characters.'
        )
      )
    })
  })

  describe('node', () => {
    it('should generate file upload form from data', () => {
      const formData = new NodeFormData()
      const testTable = 'sometable'
      const testTableWithNullVars: { [key: string]: any } = {
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
      const tableName = Object.keys(testTableWithNullVars).filter(
        (key: string) => Array.isArray(testTableWithNullVars[key])
      )[0]
      const csv = convertToCSV(testTableWithNullVars, tableName)

      jest.spyOn(formData, 'append').mockImplementation(() => {})

      generateFileUploadForm(formData, testTableWithNullVars)

      expect(formData.append).toHaveBeenCalledOnce()
      expect(formData.append).toHaveBeenCalledWith(tableName, csv, {
        contentType: 'application/csv',
        filename: `${tableName}.csv`
      })
    })

    it('should throw an error if too large string was provided', () => {
      const formData = new NodeFormData()
      const data = { testTable: [{ var1: 'z'.repeat(32765 + 1) }] }

      expect(() => generateFileUploadForm(formData, data)).toThrow(
        new Error(
          'The max length of a string value in SASjs is 32765 characters.'
        )
      )
    })
  })
})
