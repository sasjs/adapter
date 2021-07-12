import { SasAuthResponse } from '@sasjs/utils/types'

export const mockLoginAuthoriseRequiredResponse = `<form id="application_authorization" action="/SASLogon/oauth/authorize" method="POST"><input type="hidden" name="X-Uaa-Csrf" value="2nfuxIn6WaOURWL7tzTXCe"/>`
export const mockLoginSuccessResponse = `You have signed in`

export const mockAuthResponse: SasAuthResponse = {
  access_token: 'acc355',
  refresh_token: 'r3fr35h',
  id_token: 'id',
  token_type: 'bearer',
  expires_in: new Date().valueOf(),
  scope: 'default',
  jti: 'test'
}

export const generateToken = (timeToLiveSeconds: number): string => {
  const exp =
    new Date(new Date().getTime() + timeToLiveSeconds * 1000).getTime() / 1000
  const header = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9'
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64')
  const signature = '4-iaDojEVl0pJQMjrbM1EzUIfAZgsbK_kgnVyVxFSVo'
  const token = `${header}.${payload}.${signature}`
  return token
}
