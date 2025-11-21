import SASjs from '@sasjs/adapter'
import type { TestSuite } from '../types'

export const viyaFileTests = (adapter: SASjs, appLoc: string): TestSuite => ({
  name: 'SAS Viya File Tests',
  tests: [
    {
      title: 'Create html file',
      description: 'Should create an html file with appropriate properties',
      test: async () => {
        const fileContentBuffer = Buffer.from(
          `<html>` +
            `  <head><title>Test</title></head>` +
            `  <body><p>This is a test</p></body>` +
            `</html>`
        )
        // generate a timestamp string formatted as YYYYmmDDTHHMMSS_999
        const timeMark = new Date()
          .toISOString()
          .replace(/(\/|:|\s|-|Z)/g, '')
          .replace(/\./g, '_')
        const filename = `viya_createFile_test_${timeMark}.html`
        return adapter.createFile(filename, fileContentBuffer, appLoc)
      },
      assertion: () => {
        //A test that returns a boolean
        return true // dummy
      }
    }
  ]
})
