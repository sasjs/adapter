import { appContext } from '../core/AppContext'
import { TestRunner, type CompletedTestSuite } from '../core/TestRunner'
import type { TestSuite } from '../types'
import { TestSuiteElement } from './TestSuite'
import styles from './TestsView.css?inline'

export class TestsView extends HTMLElement {
  private static styleSheet = new CSSStyleSheet()
  private shadow: ShadowRoot
  private testRunner: TestRunner | null = null
  private _testSuites: TestSuite[] = []
  private debugMode: boolean = false

  static {
    this.styleSheet.replaceSync(styles)
  }

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
    this.shadow.adoptedStyleSheets = [TestsView.styleSheet]
  }

  connectedCallback() {
    this.render()
  }

  get testSuites(): TestSuite[] {
    return this._testSuites
  }

  set testSuites(suites: TestSuite[]) {
    this._testSuites = suites
    this.testRunner = new TestRunner(suites)
    this.render()
  }

  render() {
    this.shadow.innerHTML = `
      <div class="header">
        <h1>SASjs Adapter Tests</h1>
        <div class="header-controls">
          <div class="debug-toggle">
            <input type="checkbox" id="debug-toggle" ${
              this.debugMode ? 'checked' : ''
            } />
            <label for="debug-toggle">Debug Mode</label>
          </div>
          <button class="run-btn" id="run-btn">Run All Tests</button>
          <button class="logout-btn" id="logout-btn">Logout</button>
          <button class="requests-btn" id="requests-btn">View Requests</button>
        </div>
      </div>

      <div class="results" id="results"></div>
    `

    const logoutBtn = this.shadow.getElementById('logout-btn')
    logoutBtn?.addEventListener('click', () => this.handleLogout())

    const debugToggle = this.shadow.getElementById(
      'debug-toggle'
    ) as HTMLInputElement
    debugToggle?.addEventListener('change', (e) => this.handleDebugToggle(e))

    const runBtn = this.shadow.getElementById('run-btn') as HTMLButtonElement
    runBtn?.addEventListener('click', () => this.handleRunTests(runBtn))

    const requestsBtn = this.shadow.getElementById('requests-btn')
    requestsBtn?.addEventListener('click', () => this.handleViewRequests())
  }

  handleViewRequests() {
    const requestsModal = document.querySelector('requests-modal') as any
    if (requestsModal && requestsModal.openModal) {
      requestsModal.openModal()
    }
  }

  handleDebugToggle(e: Event) {
    const checkbox = e.target as HTMLInputElement
    this.debugMode = checkbox.checked

    const adapter = appContext.getAdapter()
    if (adapter) {
      adapter.setDebugState(this.debugMode)
    }
  }

  async handleLogout() {
    const adapter = appContext.getAdapter()
    if (adapter) {
      await adapter.logOut()
      appContext.setIsLoggedIn(false)
      this.dispatchEvent(
        new CustomEvent('logout', {
          bubbles: true,
          composed: true
        })
      )
    }
  }

  async handleRunTests(runBtn: HTMLButtonElement) {
    if (!this.testRunner) return

    runBtn.disabled = true
    runBtn.textContent = 'Running...'

    const resultsContainer = this.shadow.getElementById('results')
    if (resultsContainer) {
      resultsContainer.innerHTML = ''
    }

    await this.testRunner.runAllTests((completedSuites) => {
      this.renderResults(resultsContainer!, completedSuites)
    })

    runBtn.disabled = false
    runBtn.textContent = 'Run All Tests'
  }

  renderResults(container: HTMLElement, completedSuites: CompletedTestSuite[]) {
    container.innerHTML = ''

    completedSuites.forEach((suite, suiteIndex) => {
      const suiteElement = document.createElement(
        'test-suite'
      ) as TestSuiteElement
      suiteElement.suiteData = suite
      suiteElement.suiteIndex = suiteIndex

      suiteElement.addEventListener('rerun-test', ((e: CustomEvent) => {
        const { suiteIndex, testIndex } = e.detail
        this.handleRerunTest(suiteIndex, testIndex, container)
      }) as EventListener)

      container.appendChild(suiteElement)
    })
  }

  async handleRerunTest(
    suiteIndex: number,
    testIndex: number,
    container: HTMLElement
  ) {
    if (!this.testRunner) return

    await this.testRunner.rerunTest(
      suiteIndex,
      testIndex,
      (suiteIdx, testIdx, testData) => {
        const suites = container.querySelectorAll('test-suite')
        const suiteElement = suites[suiteIdx] as TestSuiteElement
        if (suiteElement && suiteElement.updateTest) {
          suiteElement.updateTest(testIdx, testData)
        }
      }
    )
  }
}

customElements.define('tests-view', TestsView)
