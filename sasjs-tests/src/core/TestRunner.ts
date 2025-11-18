import type { Test, TestSuite, TestStatus } from '../types'
import { runTest } from './runTest'

export interface CompletedTest {
  test: Test
  result: boolean
  error: unknown
  executionTime: number
  status: TestStatus
}

export interface CompletedTestSuite {
  name: string
  completedTests: CompletedTest[]
}

export class TestRunner {
  private testSuites: TestSuite[]
  private completedTestSuites: CompletedTestSuite[] = []
  private isRunning = false

  constructor(testSuites: TestSuite[]) {
    this.testSuites = testSuites
  }

  async runAllTests(
    onUpdate?: (
      completedSuites: CompletedTestSuite[],
      currentIndex: number
    ) => void
  ): Promise<CompletedTestSuite[]> {
    this.isRunning = true
    this.completedTestSuites = []

    for (let i = 0; i < this.testSuites.length; i++) {
      const suite = this.testSuites[i]
      await this.runTestSuite(suite, i, onUpdate)
    }

    this.isRunning = false
    return this.completedTestSuites
  }

  async runTestSuite(
    suite: TestSuite,
    suiteIndex: number,
    onUpdate?: (
      completedSuites: CompletedTestSuite[],
      currentIndex: number
    ) => void
  ): Promise<CompletedTestSuite> {
    const completedTests: CompletedTest[] = []
    let context: unknown

    // Run beforeAll if exists
    if (suite.beforeAll) {
      context = await suite.beforeAll()
    }

    // Run each test sequentially
    for (let i = 0; i < suite.tests.length; i++) {
      const test = suite.tests[i]
      const currentIndex = suiteIndex * 1000 + i

      // Set status to running
      const runningTest: CompletedTest = {
        test,
        result: false,
        error: null,
        executionTime: 0,
        status: 'running'
      }
      completedTests.push(runningTest)

      // Notify update
      if (onUpdate) {
        this.completedTestSuites[suiteIndex] = {
          name: suite.name,
          completedTests: [...completedTests]
        }
        onUpdate([...this.completedTestSuites], currentIndex)
      }

      // Execute test
      const result = await runTest(test, { data: context })

      // Update with result
      completedTests[i] = {
        test,
        result: result.result,
        error: result.error,
        executionTime: result.executionTime,
        status: result.result ? 'passed' : 'failed'
      }

      // Notify update
      if (onUpdate) {
        this.completedTestSuites[suiteIndex] = {
          name: suite.name,
          completedTests: [...completedTests]
        }
        onUpdate([...this.completedTestSuites], currentIndex)
      }
    }

    // Run afterAll if exists
    if (suite.afterAll) {
      await suite.afterAll()
    }

    return {
      name: suite.name,
      completedTests
    }
  }

  async rerunTest(
    suiteIndex: number,
    testIndex: number,
    onUpdate?: (
      suiteIndex: number,
      testIndex: number,
      testData: CompletedTest
    ) => void
  ): Promise<void> {
    const suite = this.testSuites[suiteIndex]
    const test = suite.tests[testIndex]

    let context: unknown
    if (suite.beforeAll) {
      context = await suite.beforeAll()
    }

    // Set status to running
    this.completedTestSuites[suiteIndex].completedTests[testIndex].status =
      'running'
    if (onUpdate) {
      onUpdate(
        suiteIndex,
        testIndex,
        this.completedTestSuites[suiteIndex].completedTests[testIndex]
      )
    }

    // Execute test
    const result = await runTest(test, { data: context })

    // Update with result
    this.completedTestSuites[suiteIndex].completedTests[testIndex] = {
      test,
      result: result.result,
      error: result.error,
      executionTime: result.executionTime,
      status: result.result ? 'passed' : 'failed'
    }

    if (onUpdate) {
      onUpdate(
        suiteIndex,
        testIndex,
        this.completedTestSuites[suiteIndex].completedTests[testIndex]
      )
    }
  }

  getCompletedTestSuites(): CompletedTestSuite[] {
    return this.completedTestSuites
  }

  isTestRunning(): boolean {
    return this.isRunning
  }
}
