export class ErrorResponse {
  error: ErrorBody

  constructor(message: string, details?: any, raw?: any) {
    let detailsString = details

    if (typeof details !== 'object') {
      try {
        detailsString = JSON.parse(details)
      } catch {
        raw = details
        detailsString = ''
      }
    }

    this.error = {
      message,
      details: detailsString,
      raw
    }
  }
}

interface ErrorBody {
  message: string
  details: string
  raw: any
}
