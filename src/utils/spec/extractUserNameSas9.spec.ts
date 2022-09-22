import { extractUserNameSas9 } from '../sas9/extractUserNameSas9'

describe('Extract username SAS9 English - two word logout handled language', () => {
  const logoutWord = 'Log Off'

  it('should return username with space after colon', () => {
    const response = `                  "title": "${logoutWord} SAS User One",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('sasuseone')
  })

  it('should return username without space after colon', () => {
    const response = `                  "title":"${logoutWord} SAS User One",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('sasuseone')
  })

  it('should return username with one word user name', () => {
    const response = `                  "title": "${logoutWord} SasUserOne",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('sasuserone')
  })

  it('should return username unknown', () => {
    const response = `                  invalid",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('unknown')
  })
})

describe('Extract username SAS9 two word logout unhandled language', () => {
  const logoutWord = 'Log out'

  it('should return username with space after colon', () => {
    const response = `                  "title": "${logoutWord} SAS User One",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('outsasuseone')
  })

  it('should return username without space after colon', () => {
    const response = `                  "title":"${logoutWord} SAS User One",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('outsasuseone')
  })

  it('should return username with one word user name', () => {
    const response = `                  "title": "${logoutWord} SasUserOne",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('outsas')
  })

  it('should return username unknown', () => {
    const response = `                  invalid",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('unknown')
  })
})

describe('Extract username SAS9 Spanish - one word logout languages', () => {
  const logoutWord = 'Desconexión'

  it('should return username with space after colon', () => {
    const response = `                  "title": "${logoutWord} SAS User One",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('sasuseone')
  })

  it('should return username without space after colon', () => {
    const response = `                  "title":"${logoutWord} SAS User One",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('sasuseone')
  })

  it('should return username with one word user name', () => {
    const response = `                  "title": "${logoutWord} SasUserOne",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('sasuserone')
  })

  it('should return username unknown', () => {
    const response = `                  invalid",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('unknown')
  })
})
