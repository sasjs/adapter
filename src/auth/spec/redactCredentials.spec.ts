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

  it('passes an absent body through', () => {
    expect(redactPayload(undefined)).toBeUndefined()
  })
})
