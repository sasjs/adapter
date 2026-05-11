/* eslint-disable @typescript-eslint/no-explicit-any */
import SASjs from '@sasjs/adapter'
import type { TestSuite } from '../types'

const stringData: any = { table1: [{ col1: 'first col value' }] }
const fileData: any = { table1: [{ col1: 'value with ; semicolon' }] }

export const webJobExecutorTests = (adapter: SASjs): TestSuite => ({
  name: 'WebJobExecutor',
  tests: [
    {
      title: 'Empty payload, useComputeApi=null, _executionTasks flag',
      description:
        'WebJobExecutor (useComputeApi=null) should skip multipart when payload empty; Viya rejects multipart on _executionTasks=true',
      test: () => {
        return adapter
          .request('services/common/sendArr&_executionTasks=true', null, {
            useComputeApi: null
          })
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e }))
      },
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'Table payload, useComputeApi=null, _executionTasks flag',
      description:
        'WebJobExecutor (useComputeApi=null) with _executionTasks=true and table payload should send urlencoded body',
      test: () => {
        return adapter
          .request('services/common/sendArr&_executionTasks=true', stringData, {
            useComputeApi: null
          })
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e }))
      },
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'File payload, useComputeApi=null, _executionTasks flag',
      description:
        'WebJobExecutor (useComputeApi=null) should send multipart (file upload) when payload contains a file, with _executionTasks=true',
      test: () => {
        return adapter
          .request('services/common/sendArr&_executionTasks=true', fileData, {
            useComputeApi: null
          })
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e }))
      },
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'Empty payload, useComputeApi=null, no _executionTasks flag',
      description:
        'WebJobExecutor (useComputeApi=null) should skip multipart when payload empty (regular job URL)',
      test: () => {
        return adapter
          .request('services/common/sendArr', null, { useComputeApi: null })
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e }))
      },
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'Non-empty payload, useComputeApi=null, no _executionTasks flag',
      description:
        'WebJobExecutor (useComputeApi=null) should send multipart when payload present (regular job URL)',
      test: () => {
        return adapter
          .request('services/common/sendArr', stringData, {
            useComputeApi: null
          })
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e }))
      },
      assertion: (res: any) => res?.ok === true
    }
  ]
})
