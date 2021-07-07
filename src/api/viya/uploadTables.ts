import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient } from '../../request/RequestClient'
import { convertToCSV } from '../../utils/convertToCsv'

export async function uploadTables(
  requestClient: RequestClient,
  data: any,
  accessToken?: string
) {
  const uploadedFiles = []
  const headers: any = {
    'Content-Type': 'application/json'
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  for (const tableName in data) {
    const csv = convertToCSV(data[tableName])
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
