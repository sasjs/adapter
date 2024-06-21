/**
 * @jest-environment jsdom
 */
import { verifySas9Login } from '../verifySas9Login'
import * as delayModule from '../../utils/delay'
import { getExpectedLogInSuccessHeader } from '../'

describe('verifySas9Login', () => {
  const serverUrl = 'http://test-server.com'

  beforeAll(() => {
    jest.mock('../../utils')
    jest
      .spyOn(delayModule, 'delay')
      .mockImplementation(() => Promise.resolve({}))
  })

  it('should return isLoggedIn true by checking state of popup', async () => {
    const popup = {
      window: {
        location: { href: serverUrl + `/SASLogon` },
        document: {
          body: { innerText: `<h3>${getExpectedLogInSuccessHeader()}</h3>` }
        }
      }
    } as unknown as Window

    await expect(verifySas9Login(popup)).resolves.toEqual({
      isLoggedIn: true
    })
  })

  it('should return isLoggedIn false if user closed popup, already', async () => {
    const popup: Window = { closed: true } as unknown as Window

    await expect(verifySas9Login(popup)).resolves.toEqual({
      isLoggedIn: false
    })
  })
})
