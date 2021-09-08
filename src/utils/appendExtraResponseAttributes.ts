import { ExtraResponseAttributes } from '@sasjs/utils/types'

export async function appendExtraResponseAttributes(
  response: any,
  extraResponseAttributes: ExtraResponseAttributes[]
) {
  let responseObject = {}

  if (extraResponseAttributes?.length) {
    const extraAttributes = extraResponseAttributes.reduce(
      (map: any, obj: any) => ((map[obj] = response[obj]), map),
      {}
    )

    responseObject = {
      result: response.result,
      ...extraAttributes
    }
  } else responseObject = response.result

  return responseObject
}
