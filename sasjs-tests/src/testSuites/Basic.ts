import SASjs, { SASjsConfig } from '@sasjs/adapter'
import { TestSuite } from '@sasjs/test-framework'
import { ServerType } from '@sasjs/utils/types'

const stringData: any = { table1: [{ col1: 'first col value' }] }

const defaultConfig: SASjsConfig = {
  serverUrl: window.location.origin,
  pathSAS9: '/SASStoredProcess/do',
  pathSASViya: '/SASJobExecution',
  appLoc: '/Public/seedapp',
  serverType: ServerType.SasViya,
  debug: false,
  contextName: 'SAS Job Execution compute context',
  useComputeApi: false,
  allowInsecureRequests: false
}

const customConfig = {
  serverUrl: 'http://url.com',
  pathSAS9: 'sas9',
  pathSASViya: 'viya',
  appLoc: '/Public/seedapp',
  serverType: ServerType.Sas9,
  debug: false
}

export const basicTests = (
  adapter: SASjs,
  userName: string,
  password: string
): TestSuite => ({
  name: 'Basic Tests',
  tests: [
    {
      title: 'Log in',
      description: 'Should log the user in',
      test: async () => {
        return adapter.logIn(userName, password)
      },
      assertion: (response: any) =>
        response && response.isLoggedIn && response.userName === userName
    },
    {
      title: 'Multiple Log in attempts',
      description:
        'Should fail on first attempt and should log the user in on second attempt',
      test: async () => {
        await adapter.logOut()
        await adapter.logIn('invalid', 'invalid')
        return adapter.logIn(userName, password)
      },
      assertion: (response: any) =>
        response && response.isLoggedIn && response.userName === userName
    },
    {
      title: 'Trigger login callback',
      description:
        'Should trigger required login callback and after successful login, it should finish the request',
      test: async () => {
        await adapter.logOut()

        return await adapter.request(
          'common/sendArr',
          stringData,
          undefined,
          () => {
            adapter.logIn(userName, password)
          }
        )
      },
      assertion: (response: any) => {
        return response.table1[0][0] === stringData.table1[0].col1
      }
    },
    {
      title: 'Request with debug on',
      description:
        'Should complete successful request with debugging switched on',
      test: async () => {
        const config = {
          debug: true
        }

        return await adapter.request('common/sendArr', stringData, config)
      },
      assertion: (response: any) => {
        return response.table1[0][0] === stringData.table1[0].col1
      }
    },
    {
      title: 'Default config',
      description:
        'Should instantiate with default config when none is provided',
      test: async () => {
        return Promise.resolve(new SASjs())
      },
      assertion: (sasjsInstance: SASjs) => {
        const sasjsConfig = sasjsInstance.getSasjsConfig()

        return (
          sasjsConfig.serverUrl === defaultConfig.serverUrl &&
          sasjsConfig.pathSAS9 === defaultConfig.pathSAS9 &&
          sasjsConfig.pathSASViya === defaultConfig.pathSASViya &&
          sasjsConfig.appLoc === defaultConfig.appLoc &&
          sasjsConfig.serverType === defaultConfig.serverType &&
          sasjsConfig.debug === defaultConfig.debug
        )
      }
    },
    {
      title: 'Custom config',
      description: 'Should use fully custom config whenever supplied',
      test: async () => {
        return Promise.resolve(new SASjs(customConfig))
      },
      assertion: (sasjsInstance: SASjs) => {
        const sasjsConfig = sasjsInstance.getSasjsConfig()
        return (
          sasjsConfig.serverUrl === customConfig.serverUrl &&
          sasjsConfig.pathSAS9 === customConfig.pathSAS9 &&
          sasjsConfig.pathSASViya === customConfig.pathSASViya &&
          sasjsConfig.appLoc === customConfig.appLoc &&
          sasjsConfig.serverType === customConfig.serverType &&
          sasjsConfig.debug === customConfig.debug
        )
      }
    },
    {
      title: 'Config overrides',
      description: 'Should override default config with supplied properties',
      test: async () => {
        return Promise.resolve(
          new SASjs({ serverUrl: 'http://test.com', debug: false })
        )
      },
      assertion: (sasjsInstance: SASjs) => {
        const sasjsConfig = sasjsInstance.getSasjsConfig()
        return (
          sasjsConfig.serverUrl === 'http://test.com' &&
          sasjsConfig.pathSAS9 === defaultConfig.pathSAS9 &&
          sasjsConfig.pathSASViya === defaultConfig.pathSASViya &&
          sasjsConfig.appLoc === defaultConfig.appLoc &&
          sasjsConfig.serverType === defaultConfig.serverType &&
          sasjsConfig.debug === false
        )
      }
    },
    {
      title: 'Request with extra attributes on JES approach',
      description:
        'Should complete successful request with extra attributes present in response',
      test: async () => {
        const config = {
          useComputeApi: false
        }

        return await adapter.request(
          'common/sendArr',
          stringData,
          config,
          undefined,
          undefined,
          ['output', 'file', 'data']
        )
      },
      assertion: (response: any) => {
        const responseKeys: any = Object.keys(response)
        return (
          responseKeys.includes('file') &&
          responseKeys.includes('output') &&
          responseKeys.includes('data')
        )
      }
    }
  ]
})
