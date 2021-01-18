import axios from 'axios'

export const parseAndSubmitAuthorizeForm = async (
  response: string,
  serverUrl: string
) => {
  let authUrl: string | null = null
  const params: any = {}

  const responseBody = response.split('<body>')[1].split('</body>')[0]
  const bodyElement = document.createElement('div')
  bodyElement.innerHTML = responseBody

  const form = bodyElement.querySelector('#application_authorization')
  authUrl = form ? serverUrl + form.getAttribute('action') : null

  const inputs: any = form?.querySelectorAll('input')

  for (const input of inputs) {
    if (input.name === 'user_oauth_approval') {
      input.value = 'true'
    }

    params[input.name] = input.value
  }

  const formData = new FormData()

  for (const key in params) {
    if (params.hasOwnProperty(key)) {
      formData.append(key, params[key])
    }
  }

  if (!authUrl) {
    throw new Error('Auth Form URL is null or undefined.')
  }

  return await axios
    .post(authUrl, formData, { withCredentials: true, responseType: 'text' })
    .then((response) => response.data)
}
