import React, { ReactElement, useState, useContext, useEffect } from 'react'
import { TestSuiteRunner, TestSuite, AppContext } from '@sasjs/test-framework'
import { basicTests } from './testSuites/Basic'
import { sendArrTests, sendObjTests } from './testSuites/RequestData'
import { specialCaseTests } from './testSuites/SpecialCases'
import { sasjsRequestTests } from './testSuites/SasjsRequests'
import '@sasjs/test-framework/dist/index.css'
import { computeTests } from './testSuites/Compute'
import { fileUploadTests } from './testSuites/FileUpload'

const App = (): ReactElement<{}> => {
  const { adapter, config } = useContext(AppContext)
  const [testSuites, setTestSuites] = useState<TestSuite[]>([])
  const appLoc = config.sasJsConfig.appLoc

  useEffect(() => {
    if (adapter) {
      const testSuites = [
        basicTests(adapter, config.userName, config.password),
        sendArrTests(adapter, appLoc),
        sendObjTests(adapter),
        specialCaseTests(adapter),
        sasjsRequestTests(adapter),
        fileUploadTests(adapter)
      ]

      if (adapter.getSasjsConfig().serverType === 'SASVIYA') {
        testSuites.push(computeTests(adapter, appLoc))
      }

      setTestSuites(testSuites)
    }
  }, [adapter, config, appLoc])

  return (
    <div className="app">
      {adapter && testSuites && <TestSuiteRunner testSuites={testSuites} />}
    </div>
  )
}

export default App
