import { isNode } from './'
import NodeFormData from 'form-data'

export const getFormData = (): NodeFormData | FormData =>
  isNode() ? new NodeFormData() : new FormData()
