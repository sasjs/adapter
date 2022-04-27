/**
 * @jest-environment jsdom
 */

import { FileUploader } from '../job-execution/FileUploader'
import { SASjsConfig, UploadFile } from '../types'
import { RequestClient } from '../request/RequestClient'
import axios from 'axios'
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

const sampleResponse = `{
  "SYSUSERID": "cas",
  "_DEBUG":" ",
  "SYS_JES_JOB_URI": "/jobExecution/jobs/000-000-000-000",
  "_PROGRAM" : "/Public/app/editors/loadfile",
  "SYSCC" : "0",
  "SYSJOBID" : "117382",
  "SYSWARNINGTEXT" : ""
}`

const prepareFilesAndParams = () => {
  const files: UploadFile[] = [
    {
      file: new File([''], 'testfile'),
      fileName: 'testfile'
    }
  ]
  const params = { table: 'libtable' }

  return { files, params }
}

describe('FileUploader', () => {
  const config: SASjsConfig = {
    ...new SASjsConfig(),
    appLoc: '/sample/apploc',
    debug: false
  }

  const fileUploader = new FileUploader(
    config.serverUrl,
    config.serverType!,
    '/jobs/path',
    new RequestClient('https://sample.server.com')
  )

  it('should upload successfully', async () => {
    const sasJob = 'test/upload'
    const data = prepareFilesAndParams()
    mockedAxios.post.mockImplementation(() =>
      Promise.resolve({ data: sampleResponse })
    )

    const res = await fileUploader.execute(sasJob, data, config)

    expect(res).toEqual(JSON.parse(sampleResponse))
  })

  it('should upload successfully when login is required', async () => {
    mockedAxios.post
      .mockImplementationOnce(() =>
        Promise.resolve({ data: '<form action="Logon">' })
      )
      .mockImplementationOnce(() => Promise.resolve({ data: sampleResponse }))

    const loginCallback = jest.fn().mockImplementation(async () => {
      await fileUploader.resendWaitingRequests()
      Promise.resolve()
    })

    const sasJob = 'test'
    const data = prepareFilesAndParams()

    const res = await fileUploader.execute(sasJob, data, config, loginCallback)

    expect(res).toEqual(JSON.parse(sampleResponse))

    expect(mockedAxios.post).toHaveBeenCalledTimes(2)
    expect(loginCallback).toHaveBeenCalled()
  })

  it('should an error when no files are provided', async () => {
    const sasJob = 'test/upload'
    const files: UploadFile[] = []
    const params = { table: 'libtable' }

    const res: any = await fileUploader
      .execute(sasJob, files, params, config)
      .catch((err: any) => err)
    expect(res.error.message).toEqual('At least one file must be provided.')
  })

  it('should throw an error when no sasJob is provided', async () => {
    const sasJob = ''
    const data = prepareFilesAndParams()

    const res: any = await fileUploader
      .execute(sasJob, data, config)
      .catch((err: any) => err)
    expect(res.error.message).toEqual('sasJob must be provided.')
  })

  it('should throw an error when invalid JSON is returned by the server', async () => {
    mockedAxios.post.mockImplementation(() =>
      Promise.resolve({ data: '{invalid: "json"' })
    )

    const sasJob = 'test'
    const data = prepareFilesAndParams()

    const res: any = await fileUploader
      .execute(sasJob, data, config)
      .catch((err: any) => err)

    expect(res.error.message).toEqual('File upload request failed.')
  })

  it('should throw an error when the server request fails', async () => {
    mockedAxios.post.mockImplementation(() =>
      Promise.reject({ data: '{message: "Server error"}' })
    )

    const sasJob = 'test'
    const data = prepareFilesAndParams()

    const res: any = await fileUploader
      .execute(sasJob, data, config)
      .catch((err: any) => err)
    expect(res.error.message).toEqual('File upload request failed.')
  })
})
