import { appContext } from '../core/AppContext'
import styles from './LoginForm.css?inline'

export class LoginForm extends HTMLElement {
  private static styleSheet = new CSSStyleSheet()
  private shadow: ShadowRoot

  static {
    this.styleSheet.replaceSync(styles)
  }

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
    this.shadow.adoptedStyleSheets = [LoginForm.styleSheet]
  }

  connectedCallback() {
    this.render()
    this.attachEventListeners()
  }

  render() {
    this.shadow.innerHTML = `
      <h1>SASjs Tests</h1>
      <form id="login-form">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" placeholder="Enter username" required />

        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Enter password" required />

        <button type="submit" id="submit-btn">Log In</button>
        <div class="error" id="error"></div>
      </form>
    `
  }

  attachEventListeners() {
    const form = this.shadow.getElementById('login-form') as HTMLFormElement
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      await this.handleLogin()
    })
  }

  async handleLogin() {
    const username = (
      this.shadow.getElementById('username') as HTMLInputElement
    ).value
    const password = (
      this.shadow.getElementById('password') as HTMLInputElement
    ).value
    const submitBtn = this.shadow.getElementById(
      'submit-btn'
    ) as HTMLButtonElement
    const errorDiv = this.shadow.getElementById('error') as HTMLDivElement

    errorDiv.textContent = ''
    submitBtn.textContent = 'Logging in...'
    submitBtn.disabled = true

    try {
      const adapter = appContext.getAdapter()
      if (!adapter) {
        throw new Error('Adapter not initialized')
      }

      const response = await adapter.logIn(username, password)

      if (response && response.isLoggedIn) {
        appContext.setIsLoggedIn(true)
        this.dispatchEvent(
          new CustomEvent('login-success', {
            bubbles: true,
            composed: true
          })
        )
      } else {
        throw new Error('Login failed')
      }
    } catch (error: unknown) {
      errorDiv.textContent =
        error instanceof Error
          ? error.message
          : 'Login failed. Please try again.'
      submitBtn.textContent = 'Log In'
      submitBtn.disabled = false
    }
  }
}

customElements.define('login-form', LoginForm)
