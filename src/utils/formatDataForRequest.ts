import { convertToCSV } from './convertToCsv'
import { splitChunks } from './splitChunks'

export const formatDataForRequest = (data: any) => {
  const sasjsTables = []
  let tableCounter = 0
  const result: any = {}

  for (const tableName in data) {
    tableCounter++
    sasjsTables.push(tableName)
    const csv = convertToCSV(data[tableName])
    if (csv === 'ERROR: LARGE STRING LENGTH') {
      throw new Error(
        'The max length of a string value in SASjs is 32765 characters.'
      )
    }
    // if csv has length more then 16k, send in chunks
    if (csv.length > 16000) {
      const csvChunks = splitChunks(csv)
      // append chunks to form data with same key
      result[`sasjs${tableCounter}data0`] = csvChunks.length
      csvChunks.forEach((chunk, index) => {
        result[`sasjs${tableCounter}data${index + 1}`] = chunk
      })
    } else {
      result[`sasjs${tableCounter}data`] = csv
    }
  }
  result['sasjs_tables'] = sasjsTables.join(' ')

  return result
}
