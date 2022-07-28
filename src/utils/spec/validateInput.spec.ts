import {
  validateInput,
  INVALID_TABLE_STRUCTURE,
  MORE_INFO
} from '../validateInput'

const tableArray = [{ col1: 'first col value' }]
const stringData: any = { table1: tableArray }

describe('validateInput', () => {
  it('should not return an error message if input data valid', () => {
    const validationResult = validateInput(stringData)
    expect(validationResult).toEqual({
      status: true,
      msg: ''
    })
  })

  it('should not return an error message if input data is null', () => {
    const validationResult = validateInput(null)
    expect(validationResult).toEqual({
      status: true,
      msg: ''
    })
  })

  it('should return an error message if input data is an array', () => {
    const validationResult = validateInput(tableArray)
    expect(validationResult).toEqual({
      status: false,
      msg: INVALID_TABLE_STRUCTURE
    })
  })

  it('should return an error message if first letter of table is neither alphabet nor underscore', () => {
    const validationResult = validateInput({ '1stTable': tableArray })
    expect(validationResult).toEqual({
      status: false,
      msg: 'First letter of table should be alphabet or underscore.'
    })
  })

  it('should return an error message if table name contains a character other than alphanumeric or underscore', () => {
    const validationResult = validateInput({ 'table!': tableArray })
    expect(validationResult).toEqual({
      status: false,
      msg: 'Table name should be alphanumeric.'
    })
  })

  it('should return an error message if length of table name contains exceeds 32', () => {
    const validationResult = validateInput({
      xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx: tableArray
    })
    expect(validationResult).toEqual({
      status: false,
      msg: 'Maximum length for table name could be 32 characters.'
    })
  })

  it('should return an error message if table does not have array of objects', () => {
    const validationResult = validateInput({ table: stringData })
    expect(validationResult).toEqual({
      status: false,
      msg: INVALID_TABLE_STRUCTURE
    })
  })

  it('should return an error message if a table array has an item other than object', () => {
    const validationResult = validateInput({ table1: ['invalid'] })
    expect(validationResult).toEqual({
      status: false,
      msg: `Table table1 contains invalid structure. ${MORE_INFO}`
    })
  })

  it('should return an error message if a row in a table contains an column with undefined value', () => {
    const validationResult = validateInput({ table1: [{ column: undefined }] })
    expect(validationResult).toEqual({
      status: false,
      msg: `A row in table table1 contains invalid value. Can't assign undefined to column.`
    })
  })
})
