/**
 * @jest-environment jsdom
 */
import { openWebPage } from '../openWebPage'
import * as loginPromptModule from '../../utils/loginPrompt'

describe('openWebPage', () => {
  const serverUrl = 'http://test-server.com'

  describe('window.open is not blocked', () => {
    const mockedOpen = jest
      .fn()
      .mockImplementation(() => (({} as unknown) as Window))
    const originalOpen = window.open

    beforeAll(() => {
      window.open = mockedOpen
    })
    afterAll(() => {
      window.open = originalOpen
    })

    it(`should return new Window popup - using default adapter's dialog`, async () => {
      await expect(openWebPage(serverUrl)).resolves.toBeDefined()

      expect(mockedOpen).toBeCalled()
    })
  })

  describe('window.open is blocked', () => {
    const mockedOpen = jest.fn().mockImplementation(() => null)
    const originalOpen = window.open

    beforeAll(() => {
      window.open = mockedOpen
    })
    afterAll(() => {
      window.open = originalOpen
    })

    it(`should return new Window popup - using default adapter's dialog`, async () => {
      jest.mock('../../utils/loginPrompt')
      jest
        .spyOn(loginPromptModule, 'openLoginPrompt')
        .mockImplementation(() => Promise.resolve(true))

      await expect(openWebPage(serverUrl)).resolves.toBeDefined()
      expect(loginPromptModule.openLoginPrompt).toBeCalled()
      expect(mockedOpen).toBeCalled()
    })

    it(`should return new Window popup - using frontend's provided onloggedOut`, async () => {
      const onLoggedOut = jest
        .fn()
        .mockImplementation(() => Promise.resolve(true))

      await expect(
        openWebPage(serverUrl, undefined, undefined, onLoggedOut)
      ).resolves.toBeDefined()
      expect(onLoggedOut).toBeCalled()
      expect(mockedOpen).toBeCalled()
    })
  })
})
