import {
  REDACTED,
  isSecretKey,
  redactAuthorizationValue,
  redactHeaders,
  redactPayload
} from '../redactCredentials'
import NodeFormData from 'form-data'

describe('redactCredentials', () => {
  it('knows which parameter names carry a credential', () => {
    for (const key of [
      'authorization',
      'Authorization',
      'client_secret',
      'clientSecret',
      'secret',
      'password',
      'refresh_token',
      'refreshToken',
      'access_token',
      'id_token',
      'code',
      'cookie',
      'x-csrf-token'
    ])
      expect(isSecretKey(key)).toBe(true)

    for (const key of [
      'grant_type',
      'Accept',
      'content-type',
      'client_id',
      'username'
    ])
      expect(isSecretKey(key)).toBe(false)
  })

  it('keeps the authorisation scheme and drops the credential', () => {
    expect(redactAuthorizationValue('Basic dGVzdElkOnRlc3RTZWNyZXQ=')).toBe(
      'Basic <redacted>'
    )
    expect(redactAuthorizationValue('Bearer eyJhbGciOiJIUzI1NiJ9')).toBe(
      'Bearer <redacted>'
    )
    // an unexpected shape is still a credential until proven otherwise
    expect(redactAuthorizationValue('dGVzdElkOnRlc3RTZWNyZXQ=')).toBe(REDACTED)
  })

  it('redacts the headers that carry a session or a client pair', () => {
    expect(
      redactHeaders({
        Authorization: 'Basic dGVzdElkOnRlc3RTZWNyZXQ=',
        Accept: 'application/json',
        Cookie: 'sas-session=abc',
        'X-CSRF-Token': 'c2NyZWFt'
      })
    ).toEqual({
      Authorization: 'Basic <redacted>',
      Accept: 'application/json',
      Cookie: REDACTED,
      'X-CSRF-Token': REDACTED
    })
  })

  it('redacts the values of a URL-encoded body and keeps the rest', () => {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: 'the-authorization-code'
    })

    expect(redactPayload(body)).toEqual({
      grant_type: 'authorization_code',
      code: REDACTED
    })
  })

  it('redacts the values of a plain object body', () => {
    expect(
      redactPayload({
        grant_type: 'client_credentials',
        client_id: 'cl13nt',
        client_secret: 's3cr3t',
        refresh_token: 'refresh-value'
      })
    ).toEqual({
      grant_type: 'client_credentials',
      client_id: 'cl13nt',
      client_secret: REDACTED,
      refresh_token: REDACTED
    })
  })

  it('reports a multipart body as its shape, not its fields', () => {
    const form = new NodeFormData()
    form.append('grant_type', 'refresh_token')
    form.append('refresh_token', 'a-very-recognisable-refresh-token')

    const redacted = redactPayload(form)

    expect(typeof redacted).toBe('string')
    expect(redacted).not.toContain('a-very-recognisable-refresh-token')
    expect(redacted).toContain('redacted')
  })

  it('redacts a form-encoded body passed as text', () => {
    // the parameter admits a string, and a string must not be iterated as its
    // characters - the token would reconstruct one letter at a time
    expect(
      redactPayload('grant_type=refresh_token&refresh_token=sekret-token')
    ).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REDACTED
    })
  })

  it('reports a text body it cannot parse as a shape, not as content', () => {
    expect(redactPayload('<html><body>secret</body></html>')).toBe(
      'text body - values redacted'
    )
  })

  it('never decodes a JSON body as form-encoded, padding and all', () => {
    // base64 padding puts '=' inside the secret, and splitting the body on the
    // first '=' turns the secret's own text into a parameter name - which no
    // secret-name check can catch, because it is not a name
    const body = '{"client_secret":"YWJjZGVMb25nU2VjcmV0Wg=="}'

    const redacted = redactPayload(body)

    expect(redacted).toBe('text body - values redacted')
    expect(String(redacted)).not.toContain('YWJjZGVMb25nU2VjcmV0Wg')
  })

  it('never decodes a JSON array body as form-encoded', () => {
    const redacted = redactPayload('[{"code":"abc=="},{"code":"def=="}]')

    expect(redacted).toBe('text body - values redacted')
    expect(String(redacted)).not.toContain('abc')
  })

  it('reports a body whose pair has a non-parameter name as a shape', () => {
    // a name this module would have to guess at: reported, not printed
    const redacted = redactPayload('{"client_secret":"abc"}=1&grant_type=code')

    expect(redacted).toBe('text body - values redacted')
    expect(String(redacted)).not.toContain('abc')
  })

  it('keeps reading a real form-encoded body, including a value with = in it', () => {
    expect(
      redactPayload('grant_type=authorization_code&code=YWJj=ZGVm')
    ).toEqual({
      grant_type: 'authorization_code',
      code: REDACTED
    })

    expect(redactPayload('user=me&pass=a=b')).toEqual({
      user: 'me',
      pass: 'a=b'
    })
  })

  it('never walks a byte view of the body as an object', () => {
    // a Buffer walked as an object leaves one numbered key per byte, which
    // reproduces the body the module exists to keep out of the report
    const body = Buffer.from(
      'grant_type=refresh_token&refresh_token=SECRET-VALUE-123'
    )

    for (const view of [
      body,
      new Uint8Array(body),
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
    ]) {
      const redacted = redactPayload(view)

      expect(redacted).toBe('binary body - values redacted')
      expect(String(redacted)).not.toContain('SECRET-VALUE-123')
      // and not the byte-by-byte reproduction either
      expect(String(redacted)).not.toContain('103,')
    }
  })

  it('never walks a byte view nested inside the body either', () => {
    // the guard has to hold where the walk happens, not only at the entry point
    const redacted = redactPayload({
      body: Buffer.from(
        'grant_type=refresh_token&refresh_token=SECRET-VALUE-123'
      )
    }) as Record<string, unknown>

    expect(redacted).toEqual({ body: 'binary body - values redacted' })
    expect(JSON.stringify(redacted)).not.toContain('103')
    expect(JSON.stringify(redacted)).not.toContain('SECRET-VALUE-123')
  })

  it('reports a payload that refers to itself instead of overflowing', () => {
    // a stack overflow would replace the token failure the report exists to explain
    const circular: Record<string, unknown> = { grant_type: 'refresh_token' }
    circular.self = circular

    const redacted = redactPayload(circular) as Record<string, unknown>

    expect(redacted.grant_type).toBe('refresh_token')
    expect(redacted.self).toBe('circular body - values redacted')
  })

  it('reports a payload nested past the cap instead of overflowing', () => {
    let deep: Record<string, unknown> = { grant_type: 'refresh_token' }

    for (let depth = 0; depth < 10000; depth++) deep = { nested: deep }

    const redacted = redactPayload(deep) as Record<string, unknown>

    expect(JSON.stringify(redacted)).toContain(
      'nested too deep - values redacted'
    )
    expect(JSON.stringify(redacted)).not.toContain('RangeError')
  })

  it('walks a sub-object shared between two keys rather than calling it circular', () => {
    // only the current path is remembered: sharing is not a cycle
    const shared = { grant_type: 'authorization_code', code: 'abc' }

    const redacted = redactPayload({ first: shared, second: shared }) as Record<
      string,
      Record<string, unknown>
    >

    expect(redacted.first).toEqual({
      grant_type: 'authorization_code',
      code: REDACTED
    })
    expect(redacted.second).toEqual({
      grant_type: 'authorization_code',
      code: REDACTED
    })
  })

  it('redacts secret-named keys at any depth', () => {
    expect(
      redactPayload({
        token: 'top-level-secret',
        nested: {
          client_secret: 'inner-secret',
          grant_type: 'authorization_code'
        }
      })
    ).toEqual({
      token: REDACTED,
      nested: { client_secret: REDACTED, grant_type: 'authorization_code' }
    })
  })

  it('does not backtrack on a body that is almost form-encoded', () => {
    // the first attempt validated pairs with a nested quantifier, which CodeQL
    // flagged as exponential on this shape; the check is linear now, so this
    // returns rather than stalling
    const pathological = '!=&'.repeat(20000)

    const redacted = redactPayload(pathological)

    expect(redacted).toBe('text body - values redacted')
  })

  it('passes an absent body through', () => {
    expect(redactPayload(undefined)).toBeUndefined()
  })
})
