/**
 * @jest-environment jsdom
 */

import { FileUploader } from '../FileUploader'
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
    config,
    '/jobs/path',
    new RequestClient('https://sample.server.com')
  )

  it('should upload successfully', async () => {
    const sasJob = 'test/upload'
    const { files, params } = prepareFilesAndParams()
    mockedAxios.post.mockImplementation(() =>
      Promise.resolve({ data: sampleResponse })
    )

    const res = await fileUploader.uploadFile(sasJob, files, params)

    expect(res).toEqual(JSON.parse(sampleResponse))
  })

  it('should an error when no files are provided', async () => {
    const sasJob = 'test/upload'
    const files: UploadFile[] = []
    const params = { table: 'libtable' }

    const err = await fileUploader
      .uploadFile(sasJob, files, params)
      .catch((err: any) => err)
    expect(err.error.message).toEqual('At least one file must be provided.')
  })

  it('should throw an error when no sasJob is provided', async () => {
    const sasJob = ''
    const { files, params } = prepareFilesAndParams()

    const err = await fileUploader
      .uploadFile(sasJob, files, params)
      .catch((err: any) => err)
    expect(err.error.message).toEqual('sasJob must be provided.')
  })

  it('should throw an error when login is required', async () => {
    mockedAxios.post.mockImplementation(() =>
      Promise.resolve({ data: '<form action="Logon">' })
    )

    const sasJob = 'test'
    const { files, params } = prepareFilesAndParams()

    const err = await fileUploader
      .uploadFile(sasJob, files, params)
      .catch((err: any) => err)
    expect(err.error.message).toEqual('You must be logged in to upload a file.')
  })

  it('should throw an error when invalid JSON is returned by the server', async () => {
    mockedAxios.post.mockImplementation(() =>
      Promise.resolve({ data: '{invalid: "json"' })
    )

    const sasJob = 'test'
    const { files, params } = prepareFilesAndParams()

    const err = await fileUploader
      .uploadFile(sasJob, files, params)
      .catch((err: any) => err)
    expect(err.error.message).toEqual('File upload request failed.')
  })

  it('should throw an error when the server request fails', async () => {
    mockedAxios.post.mockImplementation(() =>
      Promise.reject({ data: '{message: "Server error"}' })
    )

    const sasJob = 'test'
    const { files, params } = prepareFilesAndParams()

    const err = await fileUploader
      .uploadFile(sasJob, files, params)
      .catch((err: any) => err)
    expect(err.error.message).toEqual('File upload request failed.')
  })
})
