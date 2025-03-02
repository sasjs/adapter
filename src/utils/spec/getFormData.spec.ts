import { getFormData } from '..'
import * as isNodeModule from '../isNode'
import NodeFormData from 'form-data'

describe('getFormData', () => {
  it('should return NodeFormData if environment is Node', () => {
    jest.spyOn(isNodeModule, 'isNode').mockImplementation(() => true)

    expect(getFormData() instanceof NodeFormData).toEqual(true)
  })

  it('should return FormData if environment is not Node', () => {
    // Ensure FormData is globally available
    ;(global as any).FormData = class FormData {}

    jest.spyOn(isNodeModule, 'isNode').mockImplementation(() => false)

    expect(getFormData() instanceof FormData).toEqual(true)
  })
})
