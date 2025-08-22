import { ArgumentError } from './errors'

export class Tables {
  _tables: { [macroName: string]: Record<string, any> }

  constructor(table: Record<string, any>, macroName: string) {
    this._tables = {}

    this.add(table, macroName)
  }

  add(table: Record<string, any> | null, macroName: string) {
    if (table && macroName) {
      if (!(table instanceof Array)) {
        throw new ArgumentError('First argument must be array')
      }
      if (typeof macroName !== 'string') {
        throw new ArgumentError('Second argument must be string')
      }
      if (!isNaN(Number(macroName[macroName.length - 1]))) {
        throw new ArgumentError('Macro name cannot have number at the end')
      }
    } else {
      throw new ArgumentError('Missing arguments')
    }

    this._tables[macroName] = table
  }
}
