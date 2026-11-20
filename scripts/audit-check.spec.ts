import { spawnSync } from 'child_process'
import { join } from 'path'

it('enforces the shared audit contract before installation', () => {
  const result = spawnSync(process.execPath, ['--test', join(__dirname, 'audit-migration.test.mjs')], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
    env: process.env
  })
  expect({ status: result.status, output: `${result.stdout}\n${result.stderr}`, error: result.error?.message }).toEqual({
    status: 0,
    output: expect.any(String),
    error: undefined
  })
})
