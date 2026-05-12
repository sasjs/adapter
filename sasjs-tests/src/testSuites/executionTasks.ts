/* eslint-disable @typescript-eslint/no-explicit-any */
import SASjs from '@sasjs/adapter'
import type { TestSuite } from '../types'

const tableData: any = { table1: [{ col1: 'first col value' }] }
const fileData: any = { table1: [{ col1: 'value with ; semicolon' }] }

export const executionTasksTests = (adapter: SASjs): TestSuite => ({
  name: '_executionTasks=true behaviour',
  tests: [
    {
      title: 'sends table data in body',
      description: 'table payload, no _executionTasks flag',
      test: () =>
        adapter
          .request('services/common/sendArr', tableData, {
            useComputeApi: null
          })
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'sends table data when _executionTasks=true',
      description: 'table payload with _executionTasks=true',
      test: () =>
        adapter
          .request('services/common/sendArr&_executionTasks=true', tableData, {
            useComputeApi: null
          })
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'uploads as file when payload has semicolons',
      description: 'semicolon payload, no _executionTasks flag',
      test: () =>
        adapter
          .request('services/common/sendArr', fileData, {
            useComputeApi: null
          })
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title:
        'uploads as file when _executionTasks=true and payload has semicolons',
      description: 'semicolon payload with _executionTasks=true',
      test: () =>
        adapter
          .request('services/common/sendArr&_executionTasks=true', fileData, {
            useComputeApi: null
          })
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    }
  ]
})
