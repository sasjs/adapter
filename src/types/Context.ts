export interface Context {
  name: string
  id: string
  createdBy: string
  version: number
}

export interface EditContextInput {
  name?: string
  description?: string
  launchContext?: { name: string }
  environment?: { options?: string[]; autoExecLines?: string[] }
  authorizedUsers?: string[]
  authorizeAllAuthenticatedUsers?: boolean
}
