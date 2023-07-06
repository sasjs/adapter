import { isNode } from './'
import * as NodeFormData from 'form-data'

export const getFormData = () =>
  isNode() ? new NodeFormData() : new FormData()
