import { appContext } from '../core/AppContext'
import type { SASjsRequest } from '@sasjs/adapter'

export class RequestsModal extends HTMLElement {
  private shadow: ShadowRoot
  private dialog: HTMLDialogElement | null = null

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.render()
    this.attachEventListeners()
  }

  render() {
    this.shadow.innerHTML = `
      <link rel="stylesheet" href="${new URL(
        './RequestsModal.css',
        import.meta.url
      )}">
      <dialog id="requests-dialog">
        <div class="modal-header">
          <h2 id="modal-title"></h2>
          <button class="close-btn" id="close-btn">×</button>
        </div>
        <div class="modal-content" id="modal-content"></div>
      </dialog>
    `
  }

  attachEventListeners() {
    const dialog = this.shadow.getElementById(
      'requests-dialog'
    ) as HTMLDialogElement
    const closeBtn = this.shadow.getElementById('close-btn')

    this.dialog = dialog

    closeBtn?.addEventListener('click', () => this.closeModal())
    dialog?.addEventListener('click', (e) => {
      if (e.target === dialog) {
        this.closeModal()
      }
    })
  }

  openModal() {
    if (!this.dialog) return

    const adapter = appContext.getAdapter()
    if (!adapter) return

    const requests = adapter.getSasRequests()

    const title = this.shadow.getElementById('modal-title')
    const content = this.shadow.getElementById('modal-content')

    if (!title || !content) return

    title.textContent = 'Last 20 requests'

    if (!requests || requests.length === 0) {
      content.innerHTML = `
        <div class="debug-message">
          <div class="icon">🐛</div>
          <h3>There are no requests available.</h3>
          <span>Please run a test and check again.</span>
        </div>
      `
    } else {
      content.innerHTML = `
        <div class="requests-list">
          ${requests
            .map((request, index) => this.renderRequest(request, index))
            .join('')}
        </div>
      `

      this.attachTabListeners()
    }

    this.dialog.showModal()
  }

  closeModal() {
    this.dialog?.close()
  }

  renderRequest(request: SASjsRequest, index: number): string {
    const timestamp = new Date(request.timestamp)
    const formattedDate = timestamp.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    })
    const timeAgo = this.getTimeAgo(timestamp)

    return `
      <details data-index="${index}">
        <summary>
          <span>${request.serviceLink}</span>
          <span class="request-timestamp">${formattedDate} (${timeAgo})</span>
        </summary>
        <div class="request-content">
          <div class="tabs">
            <button class="tab-btn active" data-tab="log-${index}">Log</button>
            <button class="tab-btn" data-tab="source-${index}">Source Code</button>
            <button class="tab-btn" data-tab="generated-${index}">Generated Code</button>
          </div>
          <div class="tab-panes">
            <div class="tab-pane active" id="log-${index}">
              <pre>${this.decodeHtml(request.logFile)}</pre>
            </div>
            <div class="tab-pane" id="source-${index}">
              <pre>${this.decodeHtml(request.sourceCode)}</pre>
            </div>
            <div class="tab-pane" id="generated-${index}">
              <pre>${this.decodeHtml(request.generatedCode)}</pre>
            </div>
          </div>
        </div>
      </details>
    `
  }

  attachTabListeners() {
    const tabBtns = this.shadow.querySelectorAll('.tab-btn')
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement
        const tabId = target.getAttribute('data-tab')
        if (!tabId) return

        const container = target.closest('.request-content')
        if (!container) return

        container
          .querySelectorAll('.tab-btn')
          .forEach((b) => b.classList.remove('active'))
        container
          .querySelectorAll('.tab-pane')
          .forEach((p) => p.classList.remove('active'))

        target.classList.add('active')
        const pane = container.querySelector(`#${tabId}`)
        pane?.classList.add('active')
      })
    })
  }

  decodeHtml(encodedString: string): string {
    const tempElement = document.createElement('textarea')
    tempElement.innerHTML = encodedString
    return tempElement.value
  }

  getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)

    if (seconds < 60) return `${seconds} seconds ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    const days = Math.floor(hours / 24)
    return `${days} day${days !== 1 ? 's' : ''} ago`
  }
}

customElements.define('requests-modal', RequestsModal)
