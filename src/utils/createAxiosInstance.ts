import axios from 'axios'
import * as https from 'https'

export const createAxiosInstance = (
  baseURL: string,
  httpsAgent?: https.Agent
) => axios.create({ baseURL, httpsAgent })
