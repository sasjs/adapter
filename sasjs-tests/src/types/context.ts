import type SASjs from '@sasjs/adapter'
import type { SASjsConfig } from '@sasjs/adapter'

export interface AppConfig {
  sasJsConfig: SASjsConfig
}

export interface AppState {
  config: AppConfig | null
  adapter: SASjs | null
  isLoggedIn: boolean
}
