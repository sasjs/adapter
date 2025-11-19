import type { CompletedTest } from '../core/TestRunner'
import type { TestStatus } from '../types'
import styles from './TestCard.css?inline'

export class TestCard extends HTMLElement {
  private static styleSheet = new CSSStyleSheet()
  private shadow: ShadowRoot
  private _testData: CompletedTest | null = null

  static {
    this.styleSheet.replaceSync(styles)
  }

  static get observedAttributes() {
    return ['status', 'execution-time']
  }

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
    this.shadow.adoptedStyleSheets = [TestCard.styleSheet]
  }

  connectedCallback() {
    this.render()
  }

  attributeChangedCallback(_name: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue) {
      this.render()
    }
  }

  set testData(data: CompletedTest) {
    this._testData = data
    this.setAttribute('status', data.status)
    if (data.executionTime) {
      this.setAttribute('execution-time', data.executionTime.toString())
    }
    this.render()
  }

  get testData(): CompletedTest | null {
    return this._testData
  }

  render() {
    if (!this._testData) return

    const { test, status, executionTime, error } = this._testData
    const statusIcon = this.getStatusIcon(status)

    this.shadow.innerHTML = `
      <div class="header">
        <span class="status-icon ${status}">${statusIcon}</span>
        <h3>${test.title}</h3>
      </div>
      <p class="description">${test.description}</p>

      ${
        executionTime
          ? `
        <div class="details">
          <div class="time">Time: ${executionTime.toFixed(3)}s</div>
        </div>
      `
          : ''
      }

      ${
        error
          ? `
        <div class="error">
          <strong>Error:</strong>
          <pre>${(error as Error).message || String(error)}</pre>
        </div>
      `
          : ''
      }

      <button id="rerun-btn">Rerun</button>
    `

    const rerunBtn = this.shadow.getElementById('rerun-btn')
    if (rerunBtn) {
      rerunBtn.addEventListener('click', () => {
        this.dispatchEvent(
          new CustomEvent('rerun', {
            bubbles: true,
            composed: true
          })
        )
      })
    }
  }

  getStatusIcon(status: TestStatus): string {
    switch (status) {
      case 'passed':
        return '✓'
      case 'failed':
        return '✗'
      case 'running':
        return '⟳'
      case 'pending':
        return '○'
      default:
        return '?'
    }
  }
}

customElements.define('test-card', TestCard)
