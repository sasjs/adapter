export const parseWeboutResponse = (response: string) => {
  let sasResponse = ''

  if (response.includes('>>weboutBEGIN<<')) {
    try {
      sasResponse = response
        .split('>>weboutBEGIN<<')[1]
        .split('>>weboutEND<<')[0]
    } catch (e) {
      sasResponse = ''
      console.error(e)
    }
  }

  return sasResponse
}
