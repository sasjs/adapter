export const MORE_INFO =
  'For more info see https://sasjs.io/sasjs-adapter/#request-response'
export const INVALID_TABLE_STRUCTURE = `Parameter data contains invalid table structure. ${MORE_INFO}`

/**
 * This function validates the input data structure and table naming convention
 *
 * @param data A json object that contains one or more tables, it can also be null
 * @returns An object which contains two attributes: 1) status: boolean, 2) msg: string
 */
export const validateInput = (
  data: { [key: string]: any } | null
): {
  status: boolean
  msg: string
} => {
  if (data === null) return { status: true, msg: '' }

  if (getType(data) !== 'object') {
    return {
      status: false,
      msg: INVALID_TABLE_STRUCTURE
    }
  }

  const isSasFormatsTable = (key: string) =>
    key.match(/^\$.*/) && Object.keys(data).includes(key.replace(/^\$/, ''))

  for (const key in data) {
    if (!key.match(/^[a-zA-Z_]/) && !isSasFormatsTable(key)) {
      return {
        status: false,
        msg: 'First letter of table should be alphabet or underscore.'
      }
    }

    if (!key.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/) && !isSasFormatsTable(key)) {
      return { status: false, msg: 'Table name should be alphanumeric.' }
    }

    if (key.length > 32) {
      return {
        status: false,
        msg: 'Maximum length for table name could be 32 characters.'
      }
    }

    if (getType(data[key]) !== 'Array' && !isSasFormatsTable(key)) {
      return {
        status: false,
        msg: INVALID_TABLE_STRUCTURE
      }
    }

    for (const item of data[key]) {
      if (getType(item) !== 'object') {
        return {
          status: false,
          msg: `Table ${key} contains invalid structure. ${MORE_INFO}`
        }
      } else {
        const attributes = Object.keys(item)
        for (const attribute of attributes) {
          if (item[attribute] === undefined) {
            return {
              status: false,
              msg: `A row in table ${key} contains invalid value. Can't assign undefined to ${attribute}.`
            }
          }
        }
      }
    }
  }

  return { status: true, msg: '' }
}

/**
 * this function returns the type of variable
 *
 * @param data it could be anything, like string, array, object etc.
 * @returns a string which tells the type of input parameter
 */
const getType = (data: any): string => {
  if (Array.isArray(data)) {
    return 'Array'
  } else {
    return typeof data
  }
}
