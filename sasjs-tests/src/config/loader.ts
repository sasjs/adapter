import type { AppConfig } from '../types'

export interface ConfigWithCredentials extends AppConfig {
  userName?: string
  password?: string
}

export async function loadConfig(): Promise<ConfigWithCredentials> {
  const response = await fetch('config.json')
  if (!response.ok) {
    throw new Error('Failed to load config.json')
  }
  return response.json()
}
