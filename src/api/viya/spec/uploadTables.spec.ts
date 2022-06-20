import { RequestClient } from '../../../request/RequestClient'
import * as convertToCsvModule from '../../../utils/convertToCsv'
import { uploadTables } from '../uploadTables'

const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()

describe('uploadTables', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should return a list of uploaded files', async () => {
    const data = { foo: 'bar' }

    const files = await uploadTables(requestClient, data, 't0k3n')

    expect(files).toEqual([{ tableName: 'foo', file: 'test-file' }])
    expect(requestClient.uploadFile).toHaveBeenCalledTimes(1)
    expect(requestClient.uploadFile).toHaveBeenCalledWith(
      '/files/files#rawUpload',
      'Test CSV',
      't0k3n'
    )
  })

  it('should throw an error when the CSV exceeds the maximum length', async () => {
    const data = { foo: 'bar' }
    jest
      .spyOn(convertToCsvModule, 'convertToCSV')
      .mockImplementation(() => 'ERROR: LARGE STRING LENGTH')

    const error = await uploadTables(requestClient, data, 't0k3n').catch(
      (e: any) => e
    )

    expect(requestClient.uploadFile).not.toHaveBeenCalled()
    expect(error.message).toEqual(
      'The max length of a string value in SASjs is 32765 characters.'
    )
  })

  it('should throw an error when the file upload fails', async () => {
    const data = { foo: 'bar' }
    jest
      .spyOn(requestClient, 'uploadFile')
      .mockImplementation(() => Promise.reject('Upload Error'))

    const error = await uploadTables(requestClient, data, 't0k3n').catch(
      (e: any) => e
    )

    expect(error).toContain('Error while uploading file.')
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../../utils/convertToCsv')
  jest
    .spyOn(convertToCsvModule, 'convertToCSV')
    .mockImplementation(() => 'Test CSV')
  jest
    .spyOn(requestClient, 'uploadFile')
    .mockImplementation(() =>
      Promise.resolve({ result: 'test-file', etag: '' })
    )
}
