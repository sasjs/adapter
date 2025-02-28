import { isNode } from './'
import NodeFormData from 'form-data'

export const getFormData = () =>
  isNode() ? new NodeFormData() : new FormData()
