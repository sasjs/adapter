const instructionsToFix =
  'https://github.com/sasjs/cli/issues/1181#issuecomment-1090638584'

export class CertificateError extends Error {
  constructor(message: string) {
    super(
      `Error: ${message}\nPlease visit below link to resolve this issue:\n- ${instructionsToFix}\n`
    )
    this.name = 'CertificateError'
    Object.setPrototypeOf(this, CertificateError.prototype)
  }
}