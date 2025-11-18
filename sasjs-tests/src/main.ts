import * as SASjsModule from '@sasjs/adapter'
const SASjsImport = (SASjsModule as any).default || SASjsModule
const SASjs = SASjsImport.default

import { appContext } from './core/AppContext'
import { type ConfigWithCredentials, loadConfig } from './config/loader'
import type { TestSuite } from './types'

// Import custom elements (this registers them)
import './components/LoginForm'
import './components/TestCard'
import './components/TestSuite'
import './components/TestsView'
import './components/RequestsModal'
import type { LoginForm } from './components/LoginForm'
import type { TestsView } from './components/TestsView'
import type { RequestsModal } from './components/RequestsModal'

// Import test suites
import { basicTests } from './testSuites/Basic'
import { sendArrTests, sendObjTests } from './testSuites/RequestData'
import { fileUploadTests } from './testSuites/FileUpload'
import { computeTests } from './testSuites/Compute'
import { sasjsRequestTests } from './testSuites/SasjsRequests'

async function init() {
  const appContainer = document.getElementById('app')
  if (!appContainer) {
    console.error('App container not found')
    return
  }

  try {
    // Load config
    const config = await loadConfig()

    // Initialize adapter
    const adapter = new SASjs(config.sasJsConfig)
    appContext.setAdapter(adapter)
    appContext.setConfig(config)

    // Check session
    try {
      const sessionResponse = await adapter.checkSession()
      if (sessionResponse && sessionResponse.isLoggedIn) {
        appContext.setIsLoggedIn(true)
        showTests(appContainer, adapter, config)
        return
      }
    } catch {
      console.log('No active session, showing login')
    }

    // Show login
    showLogin(appContainer)
  } catch (error) {
    console.error('Failed to initialize app:', error)
    appContainer.innerHTML = `
      <div class="app__error">
        <h1>Initialization Error</h1>
        <p>Failed to load configuration. Please check config.json file.</p>
        <pre>${error}</pre>
      </div>
    `
  }
}

function showLogin(container: HTMLElement) {
  container.innerHTML = ''
  const loginForm = document.createElement('login-form') as LoginForm

  loginForm.addEventListener('login-success', () => {
    const adapter = appContext.getAdapter()
    const config = appContext.getConfig()
    if (adapter && config) {
      showTests(container, adapter, config)
    }
  })

  container.appendChild(loginForm)
}

function showTests(
  container: HTMLElement,
  adapter: typeof SASjs,
  config: ConfigWithCredentials
) {
  const configTyped = config as {
    sasJsConfig: { appLoc: string }
    userName?: string
    password?: string
  }
  const appLoc = configTyped.sasJsConfig.appLoc

  // Build test suites with adapter and credentials
  const testSuites: TestSuite[] = [
    basicTests(adapter, configTyped.userName || '', configTyped.password || ''),
    sendArrTests(adapter, appLoc),
    sendObjTests(adapter),
    // specialCaseTests(adapter),
    sasjsRequestTests(adapter),
    fileUploadTests(adapter)
  ]

  // Add compute tests for SASVIYA only
  if (adapter.getSasjsConfig().serverType === 'SASVIYA') {
    testSuites.push(computeTests(adapter, appLoc))
  }

  container.innerHTML = ''
  const testsView = document.createElement('tests-view') as TestsView
  testsView.testSuites = testSuites

  const requestsModal = document.createElement(
    'requests-modal'
  ) as RequestsModal

  testsView.addEventListener('logout', () => {
    showLogin(container)
  })

  container.appendChild(requestsModal)
  container.appendChild(testsView)
}

// Subscribe to auth changes
appContext.subscribe((state) => {
  const appContainer = document.getElementById('app')
  if (!appContainer) return

  if (!state.isLoggedIn) {
    showLogin(appContainer)
  } else if (state.adapter && state.config) {
    showTests(appContainer, state.adapter, state.config)
  }
})

// Initialize app
init()
