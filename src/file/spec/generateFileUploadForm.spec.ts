import { generateFileUploadForm } from '../generateFileUploadForm'
import { testTableWithNullVars } from '../../../sasjs-tests/src/testSuites/SpecialCases'

describe('generateFileUploadForm', () => {
  beforeAll(() => {
    function FormDataMock(this: any) {
      this.append = () => {}
    }

    const BlobMock = jest.fn()

    ;(global as any).FormData = FormDataMock
    ;(global as any).Blob = BlobMock
  })

  it('should generate file upload form from data', () => {
    const formData = new FormData()
    const tableName = Object.keys(testTableWithNullVars).filter((key: string) =>
      Array.isArray(testTableWithNullVars[key])
    )[0]

    jest.spyOn(formData, 'append').mockImplementation(() => {})

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
