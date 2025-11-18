import type SASjs from '@sasjs/adapter'
import type { AppConfig, AppState } from '../types'

export class AppContext {
  private state: AppState = {
    config: null,
    adapter: null,
    isLoggedIn: false
  }

  private listeners: Array<(state: AppState) => void> = []

  getState(): AppState {
    return { ...this.state }
  }

  setState(newState: Partial<AppState>): void {
    this.state = { ...this.state, ...newState }
    this.notifyListeners()
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.push(listener)
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.getState()))
  }

  setConfig(config: AppConfig): void {
    this.setState({ config })
  }

  setAdapter(adapter: SASjs): void {
    this.setState({ adapter })
  }

  setIsLoggedIn(isLoggedIn: boolean): void {
    this.setState({ isLoggedIn })
  }

  getAdapter(): SASjs | null {
    return this.state.adapter
  }

  getConfig(): AppConfig | null {
    return this.state.config
  }

  isUserLoggedIn(): boolean {
    return this.state.isLoggedIn
  }
}

// Global singleton instance
export const appContext = new AppContext()
