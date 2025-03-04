/**
 * @jest-environment node
 */
import * as https from 'https'
import NodeFormData from 'form-data'
import { SAS9ApiClient } from '../SAS9ApiClient'
import { Sas9RequestClient } from '../request/Sas9RequestClient'

// Mock the Sas9RequestClient so that we can control its behavior
jest.mock('../request/Sas9RequestClient', () => {
  return {
    Sas9RequestClient: jest
      .fn()
      .mockImplementation(
        (serverUrl: string, httpsAgentOptions?: https.AgentOptions) => {
          return {
            login: jest.fn().mockResolvedValue(undefined),
            post: jest.fn().mockResolvedValue({ result: 'execution result' })
          }
        }
      )
  }
})

describe('SAS9ApiClient', () => {
  const serverUrl = 'http://test-server.com'
  const jobsPath = '/SASStoredProcess/do'
  let client: SAS9ApiClient
  let mockRequestClient: any

  beforeEach(() => {
    client = new SAS9ApiClient(serverUrl, jobsPath)
    // Retrieve the instance of the mocked Sas9RequestClient
    mockRequestClient = (Sas9RequestClient as jest.Mock).mock.results[0].value
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getConfig', () => {
    it('should return the correct configuration', () => {
      const config = client.getConfig()
      expect(config).toEqual({ serverUrl })
    })
  })

  describe('setConfig', () => {
    it('should update the serverUrl when a valid value is provided', () => {
      const newUrl = 'http://new-server.com'
      client.setConfig(newUrl)
      expect(client.getConfig()).toEqual({ serverUrl: newUrl })
    })

    it('should not update the serverUrl when an empty string is provided', () => {
      const originalConfig = client.getConfig()
      client.setConfig('')
      expect(client.getConfig()).toEqual(originalConfig)
    })
  })

  describe('executeScript', () => {
    const linesOfCode = ['line1;', 'line2;']
    const userName = 'testUser'
    const password = 'testPass'
    const fixedTimestamp = '1234567890'
    const expectedFilename = `sasjs-execute-sas9-${fixedTimestamp}.sas`

    beforeAll(() => {
      // Stub generateTimestamp so that we get a consistent filename in our tests.
      jest
        .spyOn(require('@sasjs/utils/time'), 'generateTimestamp')
        .mockReturnValue(fixedTimestamp)
    })

    afterAll(() => {
      jest.restoreAllMocks()
    })

    it('should execute the script and return the result', async () => {
      const result = await client.executeScript(linesOfCode, userName, password)

      // Verify that login is called with the correct parameters.
      expect(mockRequestClient.login).toHaveBeenCalledWith(
        userName,
        password,
        jobsPath
      )

      // Build the expected stored process URL.
      const codeInjectorPath = `/User Folders/${userName}/My Folder/sasjs/runner`
      const expectedUrl =
        `${jobsPath}/?` + '_program=' + codeInjectorPath + '&_debug=log'

      // Verify that post was called with the expected stored process URL.
      expect(mockRequestClient.post).toHaveBeenCalledWith(
        expectedUrl,
        expect.any(NodeFormData),
        undefined,
        expect.stringContaining('multipart/form-data; boundary='),
        expect.objectContaining({
          'Content-Length': expect.any(Number),
          'Content-Type': expect.stringContaining(
            'multipart/form-data; boundary='
          ),
          Accept: '*/*'
        })
      )

      // The method should return the result from the post call.
      expect(result).toEqual('execution result')
    })

    it('should include the force output code in the uploaded form data', async () => {
      await client.executeScript(linesOfCode, userName, password)
      // Retrieve the form data passed to post
      const postCallArgs = (mockRequestClient.post as jest.Mock).mock.calls[0]
      const formData: NodeFormData = postCallArgs[1]

      // We can inspect the boundary and ensure that the filename was generated correctly.
      expect(formData.getBoundary()).toBeDefined()

      // The filename is used as the key for the form field.
      const formDataBuffer = formData.getBuffer().toString()
      expect(formDataBuffer).toContain(expectedFilename)
      // Also check that the force output code is appended.
      expect(formDataBuffer).toContain("put 'Executed sasjs run';")
    })
  })
})
