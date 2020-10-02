/**
 * Converts the given array to a CSV string.
 * @param data - the array to convert.
 */
export const convertToCSV = (data: any) => {
  if (!data.length) {
    return ''
  }

  const headers = generateCSVHeaders(data)

  const csvData = data.map((row: any) => generateCSVRow(row, headers))

  const finalCSV =
    headers.join(',').replace(/,/g, ' ') + '\r\n' + csvData.join('\r\n')

  return finalCSV
}

export const replacer = (value: any) => (value === null ? '' : value)

export const generateCSVRow = (row: any, headers: string[]) => {
  const fields = Object.keys(row).map((fieldName, index) => {
    let value
    let containsSpecialChar = false
    const currentCell = row[fieldName]

    if (JSON.stringify(currentCell).search(/(\\t|\\n|\\r)/gm) > -1) {
      value = currentCell.toString()
      containsSpecialChar = true
    } else {
      value = JSON.stringify(currentCell, (_, v: any) => replacer(v))
    }

    value = value.replace(/\\\\/gm, '\\')

    if (containsSpecialChar) {
      if (value.includes(',') || value.includes('"')) {
        value = '"' + value + '"'
      }
    } else {
      if (
        !value.includes(',') &&
        value.includes('"') &&
        !value.includes('\\"')
      ) {
        value = value.substring(1, value.length - 1)
      }

      value = value.replace(/\\"/gm, '""')
    }

    value = value.replace(/\r\n/gm, '\n')

    if (value === '' && headers[index].includes('best')) {
      value = '.'
    }

    return value
  })

  return fields.join(',')
}

export const generateCSVHeaders = (data: any) => {
  const headerFields = Object.keys(data[0])
  return headerFields.map((field) => {
    let firstFoundType: string | null = null
    let hasMixedTypes: boolean = false
    let rowNumError: number = -1

    const longestValueForField = data
      .map((row: any, index: number) => {
        if (row[field] || row[field] === '') {
          if (firstFoundType) {
            const currentFieldType =
              row[field] === '' || typeof row[field] === 'string'
                ? 'chars'
                : 'number'

            if (!hasMixedTypes) {
              hasMixedTypes = currentFieldType !== firstFoundType
              rowNumError = hasMixedTypes ? index + 1 : -1
            }
          } else {
            if (row[field] === '') {
              firstFoundType = 'chars'
            } else {
              firstFoundType =
                typeof row[field] === 'string' ? 'chars' : 'number'
            }
          }

          let byteSize

          if (typeof row[field] === 'string') {
            const doubleQuotes = row[field]
              .split('')
              .filter((char: any) => char === '"')

            byteSize = getByteSize(row[field])

            if (doubleQuotes.length > 0) {
              byteSize += doubleQuotes.length
            }
          }

          return byteSize
        }
      })
      .sort((a: number, b: number) => b - a)[0]
    if (longestValueForField > 32765) {
      throw new Error(
        'The max length of a string value in SASjs is 32765 characters.'
      )
    }
    if (hasMixedTypes) {
      throw new Error(
        `Row (${rowNumError}), Column (${field}) has mixed types.`
      )
    }

    return `${field}:${firstFoundType === 'chars' ? '$' : ''}${
      longestValueForField
        ? longestValueForField
        : firstFoundType === 'chars'
        ? '1'
        : 'best'
    }.`
  })
}

const getByteSize = (str: string) => {
  let byteSize = str.length
  for (let i = str.length - 1; i >= 0; i--) {
    const code = str.charCodeAt(i)
    if (code > 0x7f && code <= 0x7ff) byteSize++
    else if (code > 0x7ff && code <= 0xffff) byteSize += 2
    if (code >= 0xdc00 && code <= 0xdfff) i-- //trail surrogate
  }
  return byteSize
}
