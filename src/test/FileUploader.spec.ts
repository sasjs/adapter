import { FileUploader } from '../FileUploader'
import { UploadFile } from '../types'

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
  let originalFetch: any

  beforeAll(() => {
    originalFetch = (global as any).fetch
  })

  beforeEach(() => {
    ;(global as any).fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        text: () => Promise.resolve(sampleResponse)
      })
    )
  })

  afterAll(() => {
    ;(global as any).fetch = originalFetch
  })

  it('should upload successfully', async (done) => {
    const fileUploader = new FileUploader(
      '/sample/apploc',
      'https://sample.server.com',
      '/jobs/path',
      null,
      null
    )

    const sasJob = 'test/upload'
    const { files, params } = prepareFilesAndParams()

    fileUploader.uploadFile(sasJob, files, params).then((res: any) => {
      expect(JSON.stringify(res)).toEqual(
        JSON.stringify(JSON.parse(sampleResponse))
      )
      done()
    })
  })

  it('should an error when no files are provided', async (done) => {
    const fileUploader = new FileUploader(
      '/sample/apploc',
      'https://sample.server.com',
      '/jobs/path',
      null,
      null
    )

    const sasJob = 'test/upload'
    const files: UploadFile[] = []
    const params = { table: 'libtable' }

    fileUploader.uploadFile(sasJob, files, params).catch((err: any) => {
      expect(err.error.message).toEqual('At least one file must be provided.')
      done()
    })
  })

  it('should throw an error when no sasJob is provided', async (done) => {
    const fileUploader = new FileUploader(
      '/sample/apploc',
      'https://sample.server.com',
      '/jobs/path',
      null,
      null
    )

    const sasJob = ''
    const { files, params } = prepareFilesAndParams()

    fileUploader.uploadFile(sasJob, files, params).catch((err: any) => {
      expect(err.error.message).toEqual('sasJob must be provided.')
      done()
    })
  })

  it('should throw an error when login is required', async (done) => {
    ;(global as any).fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        text: () => Promise.resolve('<form action="Logon">')
      })
    )

    const fileUploader = new FileUploader(
      '/sample/apploc',
      'https://sample.server.com',
      '/jobs/path',
      null,
      null
    )

    const sasJob = 'test'
    const { files, params } = prepareFilesAndParams()

    fileUploader.uploadFile(sasJob, files, params).catch((err: any) => {
      expect(err.error.message).toEqual(
        'You must be logged in to upload a file.'
      )
      done()
    })
  })

  it('should throw an error when invalid JSON is returned by the server', async (done) => {
    ;(global as any).fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        text: () => Promise.resolve('{invalid: "json"')
      })
    )

    const fileUploader = new FileUploader(
      '/sample/apploc',
      'https://sample.server.com',
      '/jobs/path',
      null,
      null
    )

    const sasJob = 'test'
    const { files, params } = prepareFilesAndParams()

    fileUploader.uploadFile(sasJob, files, params).catch((err: any) => {
      expect(err.error.message).toEqual(
        'Error while parsing json from upload response.'
      )
      done()
    })
  })

  it('should throw an error when the server request fails', async (done) => {
    ;(global as any).fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        text: () => Promise.reject('{message: "Server error"}')
      })
    )

    const fileUploader = new FileUploader(
      '/sample/apploc',
      'https://sample.server.com',
      '/jobs/path',
      null,
      null
    )

    const sasJob = 'test'
    const { files, params } = prepareFilesAndParams()

    fileUploader.uploadFile(sasJob, files, params).catch((err: any) => {
      expect(err.error.message).toEqual('Upload request failed.')

      done()
    })
  })
})
