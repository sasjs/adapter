import SASjs from '../SASjs'

describe('Tables - basic coverage', () => {
  const adapter = new SASjs()

  it('should throw an error if first argument is not an array', () => {
    expect(() => adapter.Tables({}, 'test')).toThrow('First argument')
  })

  it('should throw an error if second argument is not a string', () => {
    // @ts-expect-error
    expect(() => adapter.Tables([], 1234)).toThrow('Second argument')
  })

  it('should throw an error if macro name ends with a number', () => {
    expect(() => adapter.Tables([], 'test1')).toThrow('number at the end')
  })

  it('should throw an error if no arguments are passed', () => {
    // @ts-expect-error
    expect(() => adapter.Tables()).toThrow('Missing arguments')
  })

  it('should create Tables class successfully with _tables property', () => {
    const tables = adapter.Tables([], 'test')
    expect(tables).toHaveProperty('_tables')
  })
})
