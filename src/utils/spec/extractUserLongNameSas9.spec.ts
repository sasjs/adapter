import { extractUserLongNameSas9 } from '../sas9/extractUserLongNameSas9'

describe('Extract username SAS9 English - two word logout handled language', () => {
  const logoutWord = 'Log Off'

  it('should return username with space after colon', () => {
    const response = `                  "title": "${logoutWord} SAS User One",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('SAS User One')
  })

  it('should return username without space after colon', () => {
    const response = `                  "title":"${logoutWord} SAS User One",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('SAS User One')
  })

  it('should return username with one word user name', () => {
    const response = `                  "title": "${logoutWord} SasUserOne",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('SasUserOne')
  })

  it('should return username unknown', () => {
    const response = `                  invalid",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('unknown')
  })
})

describe('Extract username SAS9 two word logout unhandled language', () => {
  const logoutWord = 'Log out'

  it('should return username with space after colon', () => {
    const response = `                  "title": "${logoutWord} SAS User One",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('out SAS User One')
  })

  it('should return username without space after colon', () => {
    const response = `                  "title":"${logoutWord} SAS User One",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('out SAS User One')
  })

  it('should return username with one word user name', () => {
    const response = `                  "title": "${logoutWord} SasUserOne",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('out SasUserOne')
  })

  it('should return username unknown', () => {
    const response = `                  invalid",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('unknown')
  })
})

describe('Extract username SAS9 Spanish - one word logout languages', () => {
  const logoutWord = 'Desconexión'

  it('should return username with space after colon', () => {
    const response = `                  "title": "${logoutWord} SAS User One",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('SAS User One')
  })

  it('should return username without space after colon', () => {
    const response = `                  "title":"${logoutWord} SAS User One",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('SAS User One')
  })

  it('should return username with one word user name', () => {
    const response = `                  "title": "${logoutWord} SasUserOne",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('SasUserOne')
  })

  it('should return username unknown', () => {
    const response = `                  invalid",`
    const username = extractUserLongNameSas9(response)

    expect(username).toEqual('unknown')
  })
})
