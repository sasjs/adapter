import { FolderMember, ServiceMember, ExecutionQuery } from './types'
import { RequestClient } from './request/RequestClient'

export class SASBaseApiClient {
  constructor(
    private serverUrl: string,
    private requestClient: RequestClient
  ) {}

  public setConfig(serverUrl: string) {
    if (serverUrl) this.serverUrl = serverUrl
  }

  public async deploy(members: [FolderMember, ServiceMember], appLoc: string) {
    const { result } = await this.requestClient.post<{
      status: string
      message: string
      example?: {}
    }>('/deploy', { ...members, appLoc }, undefined)

    return Promise.resolve(result)
  }

  public async executeJob(query: ExecutionQuery) {
    const { result } = await this.requestClient.post<{
      status: string
      message: string
      log?: string
      logPath?: string
      error?: {}
    }>('/execute', query, undefined)

    return Promise.resolve(result)
  }
}
