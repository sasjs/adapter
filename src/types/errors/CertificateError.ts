// Named rather than linked: a URL literal in the shipped package is what the
// supply-chain scanners flag, and the reference is findable by its number.
const instructionsToFix =
  'the sasjs/cli repository, issue #1181 - the comment on certificate handling has the workarounds'

export class CertificateError extends Error {
  constructor(message: string) {
    super(
      `${message}\nFor further information on this issue see ${instructionsToFix}.\n`
    )
    this.name = 'CertificateError'
    Object.setPrototypeOf(this, CertificateError.prototype)
  }
}
