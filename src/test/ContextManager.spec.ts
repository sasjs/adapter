import { ContextManager } from '../ContextManager'
import { RequestClient } from '../request/RequestClient'
import * as dotenv from 'dotenv'
import axios from 'axios'
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('ContextManager', () => {
  dotenv.config()

  const contextManager = new ContextManager(
    process.env.SERVER_URL as string,
    new RequestClient(process.env.SERVER_URL as string)
  )

  const defaultComputeContexts = contextManager.getDefaultComputeContexts
  const defaultLauncherContexts = contextManager.getDefaultLauncherContexts

  const getRandomDefaultComputeContext = () =>
    defaultComputeContexts[
      Math.floor(Math.random() * defaultComputeContexts.length)
    ]
  const getRandomDefaultLauncherContext = () =>
    defaultLauncherContexts[
      Math.floor(Math.random() * defaultLauncherContexts.length)
    ]

  describe('getComputeContexts', () => {
    it('should fetch compute contexts', async () => {
      const sampleComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: 'Fake Compute Context',
        attributes: {}
      }

      const sampleResponse = {
        items: [sampleComputeContext]
      }

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponse })
      )

      await expect(contextManager.getComputeContexts()).resolves.toEqual([
        sampleComputeContext
      ])
    })
  })

  describe('getLauncherContexts', () => {
    it('should fetch launcher contexts', async () => {
      const sampleComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: 'Fake Launcher Context',
        attributes: {}
      }

      const sampleResponse = {
        items: [sampleComputeContext]
      }

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponse })
      )

      await expect(contextManager.getLauncherContexts()).resolves.toEqual([
        sampleComputeContext
      ])
    })
  })

  describe('createComputeContext', () => {
    it('should throw an error if context name was not provided', async () => {
      await expect(
        contextManager.createComputeContext(
          '',
          'Test Launcher Context',
          'fakeAccountId',
          []
        )
      ).rejects.toEqual(new Error('Context name is required.'))
    })

    it('should throw an error when attempt to create context with reserved name', async () => {
      const contextName = getRandomDefaultComputeContext()

      await expect(
        contextManager.createComputeContext(
          contextName,
          'Test Launcher Context',
          'fakeAccountId',
          []
        )
      ).rejects.toEqual(
        new Error(`Compute context '${contextName}' already exists.`)
      )
    })

    it('should throw an error if context already exists', async () => {
      const contextName = 'Existing Compute Context'

      const sampleComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: contextName,
        attributes: {}
      }

      const sampleResponse = {
        items: [sampleComputeContext]
      }

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponse })
      )

      await expect(
        contextManager.createComputeContext(
          contextName,
          'Test Launcher Context',
          'fakeAccountId',
          []
        )
      ).rejects.toEqual(
        new Error(`Compute context '${contextName}' already exists.`)
      )
    })

    it('should create compute context without launcher context', async () => {
      const contextName = 'New Compute Context'

      const sampleExistingComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: 'Existing Compute Context',
        attributes: {}
      }
      const sampleNewComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: contextName,
        attributes: {}
      }

      const sampleResponseExistingComputeContexts = {
        items: [sampleExistingComputeContext]
      }
      const sampleResponseCreatedComputeContext = {
        items: [sampleNewComputeContext]
      }

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponseExistingComputeContexts })
      )

      mockedAxios.post.mockImplementation(() =>
        Promise.resolve({ data: sampleResponseCreatedComputeContext })
      )

      await expect(
        contextManager.createComputeContext(
          contextName,
          '',
          'fakeAccountId',
          []
        )
      ).resolves.toEqual({
        items: [
          {
            attributes: {},
            createdBy: 'fake creator',
            id: 'fakeId',
            name: contextName,
            version: 2
          }
        ]
      })
    })

    it('should create compute context with default launcher context', async () => {
      const contextName = 'New Compute Context'

      const sampleExistingComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: 'Existing Compute Context',
        attributes: {}
      }
      const sampleNewComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: contextName,
        attributes: {}
      }

      const sampleResponseExistingComputeContexts = {
        items: [sampleExistingComputeContext]
      }
      const sampleResponseCreatedComputeContext = {
        items: [sampleNewComputeContext]
      }

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponseExistingComputeContexts })
      )

      mockedAxios.post.mockImplementation(() =>
        Promise.resolve({ data: sampleResponseCreatedComputeContext })
      )

      await expect(
        contextManager.createComputeContext(
          contextName,
          getRandomDefaultLauncherContext(),
          'fakeAccountId',
          []
        )
      ).resolves.toEqual({
        items: [
          {
            attributes: {},
            createdBy: 'fake creator',
            id: 'fakeId',
            name: contextName,
            version: 2
          }
        ]
      })
    })

    it('should create compute context with not existing launcher context', async () => {
      const computeContextName = 'New Compute Context'
      const launcherContextName = 'New Launcher Context'

      const sampleExistingComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: 'Existing Compute Context',
        attributes: {}
      }
      const sampleNewComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: computeContextName,
        attributes: {}
      }
      const sampleNewLauncherContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: launcherContextName,
        attributes: {}
      }

      const sampleResponseExistingComputeContexts = {
        items: [sampleExistingComputeContext]
      }
      const sampleResponseCreatedLauncherContext = {
        items: [sampleNewLauncherContext]
      }
      const sampleResponseCreatedComputeContext = {
        items: [sampleNewComputeContext]
      }

      mockedAxios.get
        .mockImplementationOnce(() =>
          Promise.resolve({ data: sampleResponseExistingComputeContexts })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({ data: sampleResponseCreatedLauncherContext })
        )
      mockedAxios.post.mockImplementation(() =>
        Promise.resolve({ data: sampleResponseCreatedComputeContext })
      )

      await expect(
        contextManager.createComputeContext(
          computeContextName,
          launcherContextName,
          'fakeAccountId',
          []
        )
      ).resolves.toEqual({
        items: [
          {
            attributes: {},
            createdBy: 'fake creator',
            id: 'fakeId',
            name: computeContextName,
            version: 2
          }
        ]
      })
    })
  })

  describe('createLauncherContext', () => {
    it('should throw an error if context name was not provided', async () => {
      await expect(
        contextManager.createLauncherContext('', 'Test Description')
      ).rejects.toEqual(new Error('Context name is required.'))
    })

    it('should throw an error when attempt to create context with reserved name', async () => {
      const contextName = getRandomDefaultLauncherContext()

      await expect(
        contextManager.createLauncherContext(contextName, 'Test Description')
      ).rejects.toEqual(
        new Error(`Launcher context '${contextName}' already exists.`)
      )
    })

    it('should throw an error if context already exists', async () => {
      const contextName = 'Existing Launcher Context'

      const sampleLauncherContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: contextName,
        attributes: {}
      }

      const sampleResponse = {
        items: [sampleLauncherContext]
      }

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponse })
      )

      await expect(
        contextManager.createLauncherContext(contextName, 'Test Description')
      ).rejects.toEqual(
        new Error(`Launcher context '${contextName}' already exists.`)
      )
    })

    it('should create launcher context', async () => {
      const contextName = 'New Launcher Context'

      const sampleExistingLauncherContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: 'Existing Launcher Context',
        attributes: {}
      }
      const sampleNewLauncherContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: contextName,
        attributes: {}
      }

      const sampleResponseExistingLauncherContext = {
        items: [sampleExistingLauncherContext]
      }
      const sampleResponseCreatedLauncherContext = {
        items: [sampleNewLauncherContext]
      }

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponseExistingLauncherContext })
      )

      mockedAxios.post.mockImplementation(() =>
        Promise.resolve({ data: sampleResponseCreatedLauncherContext })
      )

      await expect(
        contextManager.createLauncherContext(contextName, 'Test Description')
      ).resolves.toEqual({
        items: [
          {
            attributes: {},
            createdBy: 'fake creator',
            id: 'fakeId',
            name: contextName,
            version: 2
          }
        ]
      })
    })
  })

  describe('editComputeContext', () => {
    const editedContext = {
      name: 'updated name',
      description: 'updated description',
      id: 'someId'
    }

    it('should throw an error if context name was not provided', async () => {
      await expect(
        contextManager.editComputeContext('', editedContext)
      ).rejects.toEqual(new Error('Context name is required.'))
    })

    it('should throw an error when attempt to edit context with reserved name', async () => {
      const contextName = getRandomDefaultComputeContext()

      let editError: Error = { name: '', message: '' }

      try {
        contextManager.isDefaultContext(
          contextName,
          defaultComputeContexts,
          'Editing default SAS compute contexts is not allowed.',
          true
        )
      } catch (error) {
        editError = error
      }

      await expect(
        contextManager.editComputeContext(contextName, editedContext)
      ).rejects.toEqual(editError)
    })

    it('should edit context if founded by name', async () => {
      const sampleComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: editedContext.name,
        attributes: {}
      }

      const sampleResponseGetComputeContextByName = {
        items: [sampleComputeContext]
      }

      mockedAxios.put.mockImplementation(() =>
        Promise.resolve({ data: sampleResponseGetComputeContextByName })
      )

      const expectedResponse = {
        etag: '',
        result: sampleResponseGetComputeContextByName,
        log: sampleResponseGetComputeContextByName
      }

      await expect(
        contextManager.editComputeContext(editedContext.name, editedContext)
      ).resolves.toEqual(expectedResponse)
    })
  })

  describe('getExecutableContexts', () => {
    it('should return executable contexts', async () => {
      const sampleComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: 'Executable Compute Context',
        attributes: {}
      }

      const sampleResponse = {
        items: [sampleComputeContext]
      }

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponse })
      )

      const user = 'testUser'

      const fakedExecuteScript = async () => {
        return Promise.resolve({ log: `SYSUSERID=${user}` })
      }

      const expectedResponse = [
        {
          ...sampleComputeContext,
          attributes: { sysUserId: user }
        }
      ]

      await expect(
        contextManager.getExecutableContexts(fakedExecuteScript)
      ).resolves.toEqual(expectedResponse)
    })

    it('should not return executable contexts', async () => {
      const sampleComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: 'Not Executable Compute Context',
        attributes: {}
      }

      const sampleResponse = {
        items: [sampleComputeContext]
      }

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponse })
      )

      const fakedExecuteScript = async () => {
        return Promise.resolve({ log: '' })
      }

      await expect(
        contextManager.getExecutableContexts(fakedExecuteScript)
      ).resolves.toEqual([])
    })
  })

  describe('deleteComputeContext', () => {
    it('should throw an error if context name was not provided', async () => {
      await expect(contextManager.deleteComputeContext('')).rejects.toEqual(
        new Error('Context name is required.')
      )
    })

    it('should throw an error when attempt to delete context with reserved name', async () => {
      const contextName = getRandomDefaultComputeContext()

      let deleteError: Error = { name: '', message: '' }

      try {
        contextManager.isDefaultContext(
          contextName,
          defaultComputeContexts,
          'Deleting default SAS compute contexts is not allowed.',
          true
        )
      } catch (error) {
        deleteError = error
      }

      await expect(
        contextManager.deleteComputeContext(contextName)
      ).rejects.toEqual(deleteError)
    })

    it('should delete context', async () => {
      const contextName = 'Compute Context To Delete'

      const sampleComputeContext = {
        createdBy: 'fake creator',
        id: 'fakeId',
        version: 2,
        name: contextName,
        attributes: {}
      }

      const sampleResponseGetComputeContextByName = {
        items: [sampleComputeContext]
      }

      const sampleResponseDeletedContext = {
        items: [sampleComputeContext]
      }

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponseGetComputeContextByName })
      )

      mockedAxios.delete.mockImplementation(() =>
        Promise.resolve({ data: sampleResponseDeletedContext })
      )

      const expectedResponse = {
        etag: '',
        result: sampleResponseDeletedContext,
        log: sampleResponseDeletedContext
      }

      await expect(
        contextManager.deleteComputeContext(contextName)
      ).resolves.toEqual(expectedResponse)
    })
  })
})
