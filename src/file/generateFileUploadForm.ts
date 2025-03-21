import NodeFormData from 'form-data'
import { convertToCSV } from '../utils/convertToCsv'
import { isNode } from '../utils'

/**
 * One of the approaches SASjs takes to send tables-formatted JSON (see README)
 * to SAS is as multipart form data, where each table is provided as a specially
 * formatted CSV file.
 * @param formData Different objects are used depending on whether the adapter is
 *  running in the browser, or in the CLI
 * @param data Special, tables-formatted JSON (see README)
 * @returns Populated formData
 */
export const generateFileUploadForm = (
  formData: FormData | NodeFormData,
  data: any
): FormData | NodeFormData => {
  for (const tableName in data) {
    if (!Array.isArray(data[tableName])) continue

    const name = tableName
    const csv = convertToCSV(data, tableName)

    if (csv === 'ERROR: LARGE STRING LENGTH') {
      throw new Error(
        'The max length of a string value in SASjs is 32765 characters.'
      )
    }

    // INFO: unfortunately it is not possible to check if formData is instance of NodeFormData or FormData because it will return true for both
    if (isNode()) {
      // INFO: environment is Node and formData is instance of NodeFormData
      ;(formData as NodeFormData).append(name, csv, {
        filename: `${name}.csv`,
        contentType: 'application/csv'
      })
    } else {
      // INFO: environment is Browser and formData is instance of FormData
      const file = new Blob([csv], {
        type: 'application/csv'
      })

      formData.append(name, file, `${name}.csv`)
    }
  }

  return formData
}
