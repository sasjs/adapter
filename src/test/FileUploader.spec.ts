import { FileUploader } from '../FileUploader'
import { UploadFile } from '../types'
;(global as any).fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    text: () => Promise.resolve(sampleResponse)
  })
)

it('should upload successfully', async (done) => {
  const fileUploader = new FileUploader(
    '/sample/apploc',
    'https://sample.server.com',
    '/jobs/path',
    null,
    null
  )

  const sasJob = 'test/upload'
  const files: UploadFile[] = [
    {
      file: new File([''], 'testfile'),
      fileName: 'testfile'
    }
  ]
  const params = { table: 'libtable' }

  fileUploader.uploadFile(sasJob, files, params).then((res: any) => {
    if (JSON.stringify(res) === JSON.stringify(JSON.parse(sampleResponse)))
      done()
  })
})

it('should throw no files error', async (done) => {
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

  fileUploader.uploadFile(sasJob, files, params).then(
    (res: any) => {},
    (err: any) => {
      if (err.error.message === 'At least one file must be provided.') done()
    }
  )
})

it('should throw no sasJob error', async (done) => {
  const fileUploader = new FileUploader(
    '/sample/apploc',
    'https://sample.server.com',
    '/jobs/path',
    null,
    null
  )

  const sasJob = ''
  const files: UploadFile[] = [
    {
      file: new File([''], 'testfile'),
      fileName: 'testfile'
    }
  ]
  const params = { table: 'libtable' }

  fileUploader.uploadFile(sasJob, files, params).then(
    (res: any) => {},
    (err: any) => {
      if (err.error.message === 'sasJob must be provided.') done()
    }
  )
})

const sampleResponse = `{
  "SYSUSERID": "cas",
  "_DEBUG":" ",
  "SYS_JES_JOB_URI": "/jobExecution/jobs/000-000-000-000",
  "_PROGRAM" : "/Public/app/editors/loadfile",
  "SYSCC" : "0",
  "SYSJOBID" : "117382",
  "SYSWARNINGTEXT" : ""
}`
