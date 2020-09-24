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
  id?: string
}

export interface ContextAllAttributes {
  attributes: {
    reuseServerProcesses: boolean
    runServerAs: string
  }
  modifiedTimeStamp: string
  createdBy: string
  creationTimeStamp: string
  launchType: string
  environment: {
    autoExecLines: [string]
  }
  launchContext: {
    contextName: string
  }
  modifiedBy: string
  id: string
  version: number
  name: string
}
