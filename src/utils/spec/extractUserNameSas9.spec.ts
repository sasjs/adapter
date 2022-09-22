import { extractUserNameSas9 } from '../sas9/extractUserNameSas9'

describe('Extract username SAS9', () => {
  it('should return username', () => {
    const response = `                  "title": "Log Off SAS User One",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('SAS User One')
  })

  it('should return username with fallback regex', () => {
    const response = `                  "title": "Logout SAS User One",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('SAS User One')
  })

  it('should return username unknown', () => {
    const response = `                  invalid",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('unknown (error fetching username)')
  })

  it('should return username with one word user name', () => {
    const response = `                  "title": "Log Off SasUserOne",`
    const username = extractUserNameSas9(response)

    expect(username).toEqual('SasUserOne')
  })

  it('should return username with unhandled Spanish language', () => {
    const response = `                  "title": "Desconectarse SAS User One",`
    const username = extractUserNameSas9(response)

    // Result won't be perfect but it will work Result will be: ctasasuseone
    // instead of sasuseone

    expect(username).toEqual('ctarse SAS User One')
  })
})
