export interface Context {
  name: string
  id: string
  createdBy: string
  version: number
  attributes?: any
}

export interface EditContextInput {
  name?: string
  description?: string
  launchContext?: { name: string }
  environment?: { options?: string[]; autoExecLines?: string[] }
  attributes?: any
  authorizedUsers?: string[]
  authorizeAllAuthenticatedUsers?: boolean
}
