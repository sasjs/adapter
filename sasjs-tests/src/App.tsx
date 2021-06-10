import React, { ReactElement, useState, useContext, useEffect } from 'react'
import { TestSuiteRunner, TestSuite, AppContext } from '@sasjs/test-framework'
import { basicTests } from './testSuites/Basic'
import { sendArrTests, sendObjTests } from './testSuites/RequestData'
import { specialCaseTests } from './testSuites/SpecialCases'
import { sasjsRequestTests } from './testSuites/SasjsRequests'
import '@sasjs/test-framework/dist/index.css'
import { computeTests } from './testSuites/Compute'

const App = (): ReactElement<{}> => {
  const { adapter, config } = useContext(AppContext)
  const [testSuites, setTestSuites] = useState<TestSuite[]>([])

  useEffect(() => {
    if (adapter) {
      const testSuites = [
        basicTests(adapter, config.userName, config.password),
        sendArrTests(adapter),
        sendObjTests(adapter),
        specialCaseTests(adapter),
        sasjsRequestTests(adapter)
      ]

      if (adapter.getSasjsConfig().serverType === 'SASVIYA') {
        testSuites.push(computeTests(adapter))
      }

      setTestSuites(testSuites)
    }
  }, [adapter, config])

  return (
    <div className="app">
      {adapter && testSuites && <TestSuiteRunner testSuites={testSuites} />}
    </div>
  )
}

export default App
