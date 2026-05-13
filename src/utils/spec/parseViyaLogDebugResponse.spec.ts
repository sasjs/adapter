import { parseSasViyaLogDebugResponse } from '../parseViyaLogDebugResponse'

describe('parseSasViyaLogDebugResponse', () => {
  it('should extract and parse JSON from inline Blob', async () => {
    const resultData = { message: 'success' }
    const response = `<html><body><script>
var blob = new Blob([\`${JSON.stringify(resultData)}\`], {type: 'application/json'});
</script></body></html>`

    const result = await parseSasViyaLogDebugResponse(response)

    expect(result).toEqual(resultData)
  })

  it('should extract and parse multiline JSON from inline Blob', async () => {
    const resultData = {
      SYSDATE: '13MAY26',
      SYSCC: '0',
      saslibs: [{ LIBRARYREF: 'FORMATS' }]
    }
    const response = `<script>
var blob = new Blob([\`{"SYSDATE" : "13MAY26"
,"SYSCC" : "0"
,"saslibs": [{"LIBRARYREF":"FORMATS"}]
}
\`], {type: 'application/json'});
</script>`

    const result = await parseSasViyaLogDebugResponse(response)

    expect(result).toEqual(resultData)
  })

  it('should throw an error if blob is not found', async () => {
    const response = `<html><body>No blob here</body></html>`

    await expect(parseSasViyaLogDebugResponse(response)).rejects.toThrow(
      'Unable to find webout blob in debug log response.'
    )
  })
})
