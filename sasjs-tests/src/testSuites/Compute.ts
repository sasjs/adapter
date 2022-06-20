import SASjs from '@sasjs/adapter'
import { TestSuite } from '@sasjs/test-framework'

const stringData: any = { table1: [{ col1: 'first col value' }] }

export const computeTests = (adapter: SASjs): TestSuite => ({
  name: 'Compute',
  tests: [
    {
      title: 'Compute API request',
      description: 'Should run the request with compute API approach',
      test: async () => {
        return await adapter.request('common/sendArr', stringData)
      },
      assertion: (response: any) => {
        return response.table1[0][0] === stringData.table1[0].col1
      }
    },
    {
      title: 'JES API request',
      description: 'Should run the request with JES API approach',
      test: async () => {
        const config = {
          useComputeApi: false
        }

        return await adapter.request('common/sendArr', stringData, config)
      },
      assertion: (response: any) => {
        return response.table1[0][0] === stringData.table1[0].col1
      }
    },
    {
      title: 'Start Compute Job - not waiting for result',
      description: 'Should start a compute job and return the session',
      test: () => {
        const data: any = { table1: [{ col1: 'first col value' }] }
        return adapter.startComputeJob('/Public/app/common/sendArr', data)
      },
      assertion: (res: any) => {
        const expectedProperties = ['id', 'applicationName', 'attributes']
        return validate(expectedProperties, res)
      }
    },
    {
      title: 'Start Compute Job - waiting for result',
      description: 'Should start a compute job and return the job',
      test: () => {
        const data: any = { table1: [{ col1: 'first col value' }] }
        return adapter.startComputeJob(
          '/Public/app/common/sendArr',
          data,
          {},
          undefined,
          true
        )
      },
      assertion: (res: any) => {
        const expectedProperties = [
          'id',
          'state',
          'creationTimeStamp',
          'jobConditionCode'
        ]
        return validate(expectedProperties, res.job)
      }
    },
    {
      title: 'Execute Script Viya - complete job',
      description: 'Should execute sas file and return log',
      test: () => {
        const fileLines = [`data;`, `do x=1 to 100;`, `output;`, `end;`, `run;`]

        return adapter.executeScriptSASViya(
          'sasCode.sas',
          fileLines,
          'SAS Studio compute context',
          undefined,
          true
        )
      },
      assertion: (res: any) => {
        const expectedLogContent = `1    data;\\n2    do x=1 to 100;\\n3    output;\\n4    end;\\n5    run;\\n\\n`

        return validateLog(expectedLogContent, res.log)
      }
    },
    {
      title: 'Execute Script Viya - failed job',
      description: 'Should execute sas file and return log',
      test: () => {
        const fileLines = [`%abort;`]

        return adapter
          .executeScriptSASViya(
            'sasCode.sas',
            fileLines,
            'SAS Studio compute context',
            undefined,
            true
          )
          .catch((err: any) => err)
      },
      assertion: (res: any) => {
        const expectedLogContent = `1    %abort;\\nERROR: The %ABORT statement is not valid in open code.\\n`

        return validateLog(expectedLogContent, res.log)
      }
    }
  ]
})

const validateLog = (text: string, log: string): boolean => {
  const isValid = JSON.stringify(log).includes(text)

  return isValid
}

const validate = (expectedProperties: string[], data: any): boolean => {
  const actualProperties = Object.keys(data)

  const isValid = expectedProperties.every(property =>
    actualProperties.includes(property)
  )
  return isValid
}
