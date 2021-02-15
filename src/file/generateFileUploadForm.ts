import { convertToCSV } from '../utils/convertToCsv'

export const generateFileUploadForm = (
  formData: FormData,
  data: any
): FormData => {
  for (const tableName in data) {
    const name = tableName
    const csv = convertToCSV(data[tableName])
    if (csv === 'ERROR: LARGE STRING LENGTH') {
      throw new Error(
        'The max length of a string value in SASjs is 32765 characters.'
      )
    }

    const file = new Blob([csv], {
      type: 'application/csv'
    })

    formData.append(name, file, `${name}.csv`)
  }

  return formData
}
