import type { CompletedTestSuite } from '../core/TestRunner'
import { TestCard } from './TestCard'
import styles from './TestSuite.css?inline'

export class TestSuiteElement extends HTMLElement {
  private static styleSheet = new CSSStyleSheet()
  private shadow: ShadowRoot
  private _suiteData: CompletedTestSuite | null = null
  private _suiteIndex: number = 0

  static {
    this.styleSheet.replaceSync(styles)
  }

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
    this.shadow.adoptedStyleSheets = [TestSuiteElement.styleSheet]
  }

  connectedCallback() {
    this.render()
  }

  set suiteData(data: CompletedTestSuite) {
    this._suiteData = data
    this.render()
  }

  get suiteData(): CompletedTestSuite | null {
    return this._suiteData
  }

  set suiteIndex(index: number) {
    this._suiteIndex = index
  }

  get suiteIndex(): number {
    return this._suiteIndex
  }

  updateTest(testIndex: number, testData: any) {
    if (!this._suiteData) return

    // Update the data
    this._suiteData.completedTests[testIndex] = testData

    // Update stats
    this.updateStats()

    // Update the specific test card
    const testsContainer = this.shadow.getElementById('tests-container')
    if (testsContainer) {
      const cards = testsContainer.querySelectorAll('test-card')
      const card = cards[testIndex] as TestCard
      if (card) {
        card.testData = testData
      }
    }
  }

  updateStats() {
    if (!this._suiteData) return

    const { completedTests } = this._suiteData
    const passed = completedTests.filter((t) => t.status === 'passed').length
    const failed = completedTests.filter((t) => t.status === 'failed').length
    const running = completedTests.filter((t) => t.status === 'running').length

    const statsEl = this.shadow.querySelector('.stats')
    if (statsEl) {
      statsEl.textContent = `Passed: ${passed} | Failed: ${failed} | Running: ${running}`
    }
  }

  render() {
    if (!this._suiteData) return

    const { name, completedTests } = this._suiteData
    const passed = completedTests.filter((t) => t.status === 'passed').length
    const failed = completedTests.filter((t) => t.status === 'failed').length
    const running = completedTests.filter((t) => t.status === 'running').length

    this.shadow.innerHTML = `
      <div class="header">
        <h2>${name}</h2>
        <div class="stats">Passed: ${passed} | Failed: ${failed} | Running: ${running}</div>
      </div>
      <div class="tests" id="tests-container"></div>
    `

    const testsContainer = this.shadow.getElementById('tests-container')
    if (testsContainer) {
      completedTests.forEach((completedTest, testIndex) => {
        const card = document.createElement('test-card') as TestCard
        card.testData = completedTest

        card.addEventListener('rerun', () => {
          this.dispatchEvent(
            new CustomEvent('rerun-test', {
              bubbles: true,
              composed: true,
              detail: {
                suiteIndex: this._suiteIndex,
                testIndex
              }
            })
          )
        })

        testsContainer.appendChild(card)
      })
    }
  }
}

customElements.define('test-suite', TestSuiteElement)
