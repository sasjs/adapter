export class ErrorResponse {
  body: ErrorBody

  constructor(message: string, details?: any) {
    let detailsString = '';
    let raw

    try {
      detailsString = JSON.stringify(details)
    } catch {
      raw = details
    }

    this.body = {
      message,
      details: detailsString,
      raw
    }
  }
}

interface ErrorBody {
  message: string
  details: string,
  raw: any
}
