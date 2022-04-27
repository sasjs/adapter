import SASjs from '@sasjs/adapter'
import { TestSuite } from '@sasjs/test-framework'

export const fileUploadTests = (adapter: SASjs): TestSuite => ({
  name: 'File Upload Tests',
  tests: [
    {
      title: 'Upload File',
      description: 'Should upload the file to VIYA',
      test: async () => {
        let blob: any = new Blob(['test'], { type: 'text/html' })
        blob['lastModifiedDate'] = ''
        blob['name'] = 'macvars_testfile'
        let file = blob

        const filesToUpload = [
          {
            file: file,
            fileName: file.name
          }
        ]

        return adapter.uploadFile('common/sendMacVars', filesToUpload, null)
      },
      assertion: (response: any) =>
        (response.macvars as any[]).findIndex(
          (el: any) => el.NAME === '_WEBIN_FILE_COUNT' && el.VALUE === '1'
        ) > -1 &&
        (response.macvars as any[]).findIndex(
          (el: any) =>
            el.NAME === '_WEBIN_FILENAME' && el.VALUE === 'macvars_testfile'
        ) > -1
    }
  ]
})
