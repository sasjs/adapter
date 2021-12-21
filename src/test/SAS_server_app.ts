import express = require('express')

export const app = express()

export const mockedAuthResponse = {
  access_token: 'access_token',
  token_type: 'bearer',
  id_token: 'id_token',
  refresh_token: 'refresh_token',
  expires_in: 43199,
  scope: 'openid',
  jti: 'jti'
}

app.get('/', function (req: any, res: any) {
  res.send('Hello World')
})

app.post('/SASLogon/oauth/token', function (req: any, res: any) {
  let valid = true

  // capture the encoded form data
  req.on('data', (data: any) => {
    const resData = data.toString()

    if (resData.includes('incorrect')) valid = false
  })

  // send a response when finished reading
  // the encoded form data
  req.on('end', () => {
    if (valid) res.status(200).send(mockedAuthResponse)
    else
      res.status(401).send({
        error: 'unauthorized',
        error_description: 'Bad credentials'
      })
  })
})
