export class ErrorResponse {
  error: ErrorBody

  constructor(message: string, details?: any) {
    let detailsString = ''
    let raw

    try {
      detailsString = JSON.stringify(details)
    } catch {
      raw = details
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
