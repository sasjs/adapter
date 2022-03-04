import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient } from '../../request/RequestClient'
import { convertToCSV } from '../../utils/convertToCsv'

/**
 * Uploads tables to SAS as specially formatted CSVs.
 * This is more compact than JSON, and easier to read within SAS.
 * @param requestClient - the pre-configured HTTP request client
 * @param data - the JSON representation of the data to be uploaded
 * @param accessToken - an optional access token for authentication/authorization
 * The access token is not required when uploading tables from the browser.
 */
export async function uploadTables(
  requestClient: RequestClient,
  data: any,
  accessToken?: string
) {
  const uploadedFiles = []

  for (const tableName in data) {
    const csv = convertToCSV(data, tableName)
    if (csv === 'ERROR: LARGE STRING LENGTH') {
      throw new Error(
        'The max length of a string value in SASjs is 32765 characters.'
      )
    }

    const uploadResponse = await requestClient
      .uploadFile(`/files/files#rawUpload`, csv, accessToken)
      .catch((err) => {
        throw prefixMessage(err, 'Error while uploading file. ')
      })

    uploadedFiles.push({ tableName, file: uploadResponse.result })
  }
  return uploadedFiles
}
