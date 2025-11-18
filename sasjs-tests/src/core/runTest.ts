import type { Test, TestResult } from '../types'

export async function runTest(
  testToRun: Test,
  context: unknown
): Promise<TestResult> {
  const { test, assertion, beforeTest, afterTest } = testToRun
  const beforeTestFunction = beforeTest ? beforeTest : () => Promise.resolve()
  const afterTestFunction = afterTest ? afterTest : () => Promise.resolve()

  const startTime = new Date().valueOf()

  return beforeTestFunction()
    .then(() => test(context))
    .then((res) => {
      return Promise.resolve(assertion(res, context))
    })
    .then((testResult) => {
      afterTestFunction()
      const endTime = new Date().valueOf()
      const executionTime = (endTime - startTime) / 1000
      return { result: testResult, error: null, executionTime }
    })
    .catch((e) => {
      console.error(e)
      const endTime = new Date().valueOf()
      const executionTime = (endTime - startTime) / 1000
      return { result: false, error: e, executionTime }
    })
}
