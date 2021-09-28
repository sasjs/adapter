export interface HttpsAgent {
  selfSigned?: {
    ca: string[]
  }
  clientCA?: {
    key: string
    cert: string
  }
  allowInsecure?: boolean
}
