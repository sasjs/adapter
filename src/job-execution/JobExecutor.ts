import { SASjsRequest } from '../types'

export type ExecuteFunction = () => Promise<any>

export interface JobExecutor {
  execute: (
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any,
    accessToken?: string
  ) => Promise<any>
  waitingRequests: ExecuteFunction[]
  resendWaitingRequests: () => Promise<void>
  getRequests: () => SASjsRequest[]
  clearRequests: () => void
}
