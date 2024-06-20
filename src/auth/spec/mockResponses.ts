import { SasAuthResponse } from '@sasjs/utils/types'
import { enLoginSuccessHeader } from '../AuthManager'

export const mockLoginAuthoriseRequiredResponse = `<form id="application_authorization" action="/SASLogon/oauth/authorize" method="POST"><input type="hidden" name="X-Uaa-Csrf" value="2nfuxIn6WaOURWL7tzTXCe"/>`
export const mockLoginSuccessResponse = enLoginSuccessHeader

export const mockAuthResponse: SasAuthResponse = {
  access_token: 'acc355',
  refresh_token: 'r3fr35h',
  id_token: 'id',
  token_type: 'bearer',
  expires_in: new Date().valueOf(),
  scope: 'default',
  jti: 'test'
}

export const mockSasjsAuthResponse = {
  access_token: 'acc355',
  refresh_token: 'r3fr35h'
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

export const mockedCurrentUserApi = (username: string) => ({
  creationTimeStamp: '2021-04-17T14:13:14.000Z',
  modifiedTimeStamp: '2021-08-31T22:08:07.000Z',
  id: username,
  type: 'user',
  name: 'Full User Name',
  links: [
    {
      method: 'GET',
      rel: 'self',
      href: `/identities/users/${username}`,
      uri: `/identities/users/${username}`,
      type: 'user'
    },
    {
      method: 'GET',
      rel: 'alternate',
      href: `/identities/users/${username}`,
      uri: `/identities/users/${username}`,
      type: 'application/vnd.sas.summary'
    }
  ],
  version: 2
})
