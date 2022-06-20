import * as NodeFormData from 'form-data'
import { convertToCSV } from '../utils/convertToCsv'
import { splitChunks } from '../utils/splitChunks'

export const generateTableUploadForm = (
  formData: FormData | NodeFormData,
  data: any
) => {
  const sasjsTables = []
  const requestParams: any = {}
  let tableCounter = 0

  for (const tableName in data) {
    tableCounter++

    sasjsTables.push(tableName)

    const csv = convertToCSV(data, tableName)

    if (csv === 'ERROR: LARGE STRING LENGTH') {
      throw new Error(
        'The max length of a string value in SASjs is 32765 characters.'
      )
    }

    // if csv has length more then 16k, send in chunks
    if (csv.length > 16000) {
      const csvChunks = splitChunks(csv)

      // append chunks to form data with same key
      csvChunks.map(chunk => {
        formData.append(`sasjs${tableCounter}data`, chunk)
      })
    } else {
      requestParams[`sasjs${tableCounter}data`] = csv
    }
  }

  requestParams['sasjs_tables'] = sasjsTables.join(' ')

  return { formData, requestParams }
}
