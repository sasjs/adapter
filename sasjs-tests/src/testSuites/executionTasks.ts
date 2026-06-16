/* eslint-disable @typescript-eslint/no-explicit-any */
import SASjs from '@sasjs/adapter'
import type { TestSuite } from '../types'

const tableData: any = { table1: [{ col1: 'first col value' }] }
const fileData: any = { table1: [{ col1: 'value with ; semicolon' }] }
const multiTableData: any = {
  table1: [{ col1: 'first col value' }],
  table2: [{ col2: 'second table value' }]
}
const multiFileData: any = {
  table1: [{ col1: 'value with ; semicolon' }],
  table2: [{ col2: 'another; value' }]
}

const taskConfig: any = { useComputeApi: null, runAsTask: true }
const noTaskConfig: any = { useComputeApi: null, runAsTask: false }

export const executionTasksTests = (adapter: SASjs): TestSuite => ({
  name: 'runAsTask behaviour',
  tests: [
    {
      title: 'no inputs (runAsTask=false)',
      description: 'no payload, runAsTask explicitly disabled',
      test: () =>
        adapter
          .request('services/common/sendArr', null, noTaskConfig)
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'no inputs (runAsTask=true)',
      description: 'no payload, runAsTask=true via config',
      test: () =>
        adapter
          .request('services/common/sendArr', null, taskConfig)
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'one input table (runAsTask=false)',
      description: 'single table payload, runAsTask explicitly disabled',
      test: () =>
        adapter
          .request('services/common/sendArr', tableData, noTaskConfig)
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'one input table (runAsTask=true)',
      description: 'single table payload, runAsTask=true via config',
      test: () =>
        adapter
          .request('services/common/sendArr', tableData, taskConfig)
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'multiple input tables (runAsTask=false)',
      description: 'multi-table payload, runAsTask explicitly disabled',
      test: () =>
        adapter
          .request('services/common/sendArr', multiTableData, noTaskConfig)
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'multiple input tables (runAsTask=true)',
      description: 'multi-table payload, runAsTask=true via config',
      test: () =>
        adapter
          .request('services/common/sendArr', multiTableData, taskConfig)
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'semicolon payload, single table, blob path (runAsTask=false)',
      description: 'semicolon payload routes through blob path, runAsTask off',
      test: () =>
        adapter
          .request('services/common/sendArr', fileData, noTaskConfig)
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'semicolon payload, single table, blob path (runAsTask=true)',
      description:
        'semicolon payload (single table) routes through blob path, runAsTask=true',
      test: () =>
        adapter
          .request('services/common/sendArr', fileData, taskConfig)
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'semicolon payload, multi-table, blob path (runAsTask=false)',
      description:
        'semicolon payload (multi-table) routes through blob path, runAsTask off',
      test: () =>
        adapter
          .request('services/common/sendArr', multiFileData, noTaskConfig)
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    },
    {
      title: 'semicolon payload, multi-table, blob path (runAsTask=true)',
      description:
        'semicolon payload (multi-table) routes through blob path, runAsTask=true',
      test: () =>
        adapter
          .request('services/common/sendArr', multiFileData, taskConfig)
          .then((res: any) => ({ ok: true, res }))
          .catch((e: any) => ({ ok: false, error: e })),
      assertion: (res: any) => res?.ok === true
    }
  ]
})
