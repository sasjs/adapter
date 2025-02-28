import { SASJS_LOGS_SEPARATOR, SasjsRequestClient } from '../SasjsRequestClient'
import { SasjsParsedResponse } from '../../types'
import { AxiosHeaders, AxiosResponse } from 'axios'

describe('SasjsRequestClient', () => {
  const requestClient = new SasjsRequestClient('')
  const etag = 'etag'
  const status = 200

  const webout = `hello`
  const log = `1                                                          The SAS System                             Tuesday, 25 July 2023 12:51:00


PROC MIGRATE will preserve current SAS file attributes and is 
recommended for converting all your SAS libraries from any 
SAS 8 release to SAS 9.  For details and examples, please see
http://support.sas.com/rnd/migration/index.html



NOTE: SAS initialization used:
    real time           0.01 seconds
    cpu time            0.02 seconds
    

`
  const printOutput = 'printOutPut'

  describe('parseResponse', () => {})

  it('should parse response with 1 log', () => {
    const response: AxiosResponse<any> = {
      data: `${webout}
${SASJS_LOGS_SEPARATOR}
${log}
${SASJS_LOGS_SEPARATOR}`,
      status,
      statusText: 'ok',
      headers: { etag },
      config: { headers: new AxiosHeaders() }
    }

    const expectedParsedResponse: SasjsParsedResponse<string> = {
      result: `${webout}
`,
      log: `
${log}
`,
      etag,
      status
    }

    expect(requestClient['parseResponse'](response)).toEqual(
      expectedParsedResponse
    )
  })

  it('should parse response with 1 log and printOutput', () => {
    const response: AxiosResponse<any> = {
      data: `${webout}
${SASJS_LOGS_SEPARATOR}
${log}
${SASJS_LOGS_SEPARATOR}
${printOutput}`,
      status,
      statusText: 'ok',
      headers: { etag },
      config: { headers: new AxiosHeaders() }
    }

    const expectedParsedResponse: SasjsParsedResponse<string> = {
      result: `${webout}
`,
      log: `
${log}
`,
      etag,
      status,
      printOutput: `
${printOutput}`
    }

    expect(requestClient['parseResponse'](response)).toEqual(
      expectedParsedResponse
    )
  })

  it('should parse response with nested logs', () => {
    const logWithNestedLog = `root log start
${SASJS_LOGS_SEPARATOR}
${log}
${SASJS_LOGS_SEPARATOR}
root log end`

    const response: AxiosResponse<any> = {
      data: `${webout}
${SASJS_LOGS_SEPARATOR}
${logWithNestedLog}
${SASJS_LOGS_SEPARATOR}`,
      status,
      statusText: 'ok',
      headers: { etag },
      config: { headers: new AxiosHeaders() }
    }

    const expectedParsedResponse: SasjsParsedResponse<string> = {
      result: `${webout}
`,
      log: `
${logWithNestedLog}
`,
      etag,
      status
    }

    expect(requestClient['parseResponse'](response)).toEqual(
      expectedParsedResponse
    )
  })

  it('should parse response with nested logs and printOutput', () => {
    const logWithNestedLog = `root log start
${SASJS_LOGS_SEPARATOR}
${log}
${SASJS_LOGS_SEPARATOR}
log with indentation
  ${SASJS_LOGS_SEPARATOR}
  ${log}
  ${SASJS_LOGS_SEPARATOR}
some SAS code containing ${SASJS_LOGS_SEPARATOR}
root log end`

    const response: AxiosResponse<any> = {
      data: `${webout}
${SASJS_LOGS_SEPARATOR}
${logWithNestedLog}
${SASJS_LOGS_SEPARATOR}
${printOutput}`,
      status,
      statusText: 'ok',
      headers: { etag },
      config: { headers: new AxiosHeaders() }
    }

    const expectedParsedResponse: SasjsParsedResponse<string> = {
      result: `${webout}
`,
      log: `
${logWithNestedLog}
`,
      etag,
      status,
      printOutput: `
${printOutput}`
    }

    expect(requestClient['parseResponse'](response)).toEqual(
      expectedParsedResponse
    )
  })
})

describe('SASJS_LOGS_SEPARATOR', () => {
  it('SASJS_LOGS_SEPARATOR should be hardcoded', () => {
    expect(SASJS_LOGS_SEPARATOR).toEqual(
      'SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784'
    )
  })
})
