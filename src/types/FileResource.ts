export interface FileResource {
  creationTimeStamp: string
  modifiedTimeStamp: string
  createdBy: string
  modifiedBy: string
  id: string
  properties: Properties
  contentDisposition: string
  contentType: string
  encoding: string
  links: Link[]
  name: string
  size: number
  searchable: boolean
  fileStatus: string
  fileVersion: number
  typeDefName: string
  version: number
  virusDetected: boolean
  urlDetected: boolean
  quarantine: boolean
}

export interface Link {
  method: string
  rel: string
  href: string
  uri: string
  type?: string
  responseType?: string
}

export interface Properties {}
