import axios from 'axios'
import type * as https from 'https'

export const createAxiosInstance = (
  baseURL: string,
  httpsAgent?: https.Agent
) => axios.create({ baseURL, httpsAgent })
