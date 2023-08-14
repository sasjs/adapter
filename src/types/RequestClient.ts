import { CsrfToken } from '..'

export interface HttpClient {
  get<T>(
    url: string,
    accessToken: string | undefined,
    contentType: string,
    overrideHeaders: { [key: string]: string | number }
  ): Promise<{ result: T; etag: string }>

  post<T>(
    url: string,
    data: any,
    accessToken: string | undefined,
    contentType: string,
    overrideHeaders: { [key: string]: string | number }
  ): Promise<{ result: T; etag: string }>

  put<T>(
    url: string,
    data: any,
    accessToken: string | undefined,
    overrideHeaders: { [key: string]: string | number }
  ): Promise<{ result: T; etag: string }>

  delete<T>(
    url: string,
    accessToken: string | undefined
  ): Promise<{ result: T; etag: string }>

  getCsrfToken(type: 'general' | 'file'): CsrfToken | undefined
  saveLocalStorageToken(accessToken: string, refreshToken: string): void
  clearCsrfTokens(): void
  clearLocalStorageTokens(): void
  getBaseUrl(): string
}

export interface SASjsRequest {
  serviceLink: string
  timestamp: Date
  sourceCode: string
  generatedCode: string
  logFile: string
  SASWORK: any
}

export interface SasjsParsedResponse<T> {
  result: T
  log: string
  etag: string
  status: number
  printOutput?: string
}

export type VerboseMode = boolean | 'bleached'
