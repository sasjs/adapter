export class ErrorResponse {
  body: ErrorBody

  constructor(message: string, details?: any) {
    this.body = {
      message,
      details
    }
  }
}

interface ErrorBody {
  message: string
  details: any
}
