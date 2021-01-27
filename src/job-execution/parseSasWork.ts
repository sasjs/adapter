import { ServerType } from '@sasjs/utils/types'
import { parseWeboutResponse } from '../utils'

export const parseSasWork = async (
  response: any,
  debug: boolean,
  serverUrl: string,
  serverType: ServerType
) => {
  if (debug) {
    let jsonResponse

    if (serverType === ServerType.Sas9) {
      try {
        jsonResponse = JSON.parse(parseWeboutResponse(response))
      } catch (e) {
        console.error(e)
      }
    } else {
      await parseSASVIYADebugResponse(response, serverUrl).then(
        (resText: any) => {
          try {
            jsonResponse = JSON.parse(resText)
          } catch (e) {
            console.error(e)
          }
        },
        (err: any) => {
          console.error(err)
        }
      )
    }

    if (jsonResponse) {
      return jsonResponse.WORK
    }
  }
  return null
}

const parseSASVIYADebugResponse = async (
  response: string,
  serverUrl: string
) => {
  return new Promise((resolve, reject) => {
    const iframeStart = response.split(
      '<iframe style="width: 99%; height: 500px" src="'
    )[1]
    const jsonUrl = iframeStart ? iframeStart.split('"></iframe>')[0] : null

    if (jsonUrl) {
      fetch(serverUrl + jsonUrl)
        .then((res) => res.text())
        .then((resText) => {
          resolve(resText)
        })
    } else {
      reject('No debug info found in response.')
    }
  })
}
