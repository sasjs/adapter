import SASjs from '@sasjs/adapter'
import { TestSuite } from '@sasjs/test-framework'

const specialCharData: any = {
  table1: [
    {
      tab: '\t',
      lf: '\n',
      cr: '\r',
      semicolon: ';semi',
      percent: '%',
      singleQuote: "'",
      doubleQuote: '"',
      crlf: '\r\n',
      euro: '€euro',
      banghash: '!#banghash',
      dot: '.'
    }
  ]
}

const moreSpecialCharData: any = {
  table1: [
    {
      speech0: '"speech',
      pct: '%percent',
      speech: '"speech',
      slash: '\\slash',
      slashWithSpecial: '\\\tslash',
      macvar: '&sysuserid',
      chinese: '传/傳chinese',
      sigma: 'Σsigma',
      at: '@at',
      serbian: 'Српски',
      dollar: '$'
    }
  ]
}

const stringData: any = { table1: [{ col1: 'first col value' }] }

const getWideData = () => {
  const cols: any = {}
  for (let i = 1; i <= 10000; i++) {
    cols['col' + i] = 'test' + i
  }

  const data: any = {
    table1: [cols]
  }

  return data
}

const getTables = () => {
  const tables: any = {}

  for (let i = 1; i <= 100; i++) {
    tables['table' + i] = [{ col1: 'x', col2: 'x', col3: 'x', col4: 'x' }]
  }
  return tables
}

const getLargeDataset = () => {
  const rows: any = []
  const colData: string =
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  for (let i = 1; i <= 10000; i++) {
    rows.push({ col1: colData, col2: colData, col3: colData, col4: colData })
  }

  const data: any = {
    table1: rows
  }

  return data
}

const errorAndCsrfData: any = {
  error: [{ col1: 'q', col2: 'w', col3: 'e', col4: 'r' }],
  _csrf: [{ col1: 'q', col2: 'w', col3: 'e', col4: 'r' }]
}

export const specialCaseTests = (adapter: SASjs): TestSuite => ({
  name: 'Special Cases',
  tests: [
    {
      title: 'Common special characters',
      description: 'Should handle common special characters',
      test: () => {
        return adapter.request('common/sendArr', specialCharData)
      },
      assertion: (res: any) => {
        return (
          res.table1[0][0] === specialCharData.table1[0].tab &&
          res.table1[0][1] === specialCharData.table1[0].lf &&
          res.table1[0][2] === specialCharData.table1[0].cr &&
          res.table1[0][3] === specialCharData.table1[0].semicolon &&
          res.table1[0][4] === specialCharData.table1[0].percent &&
          res.table1[0][5] === specialCharData.table1[0].singleQuote &&
          res.table1[0][6] === specialCharData.table1[0].doubleQuote &&
          res.table1[0][7] === '\n' &&
          res.table1[0][8] === specialCharData.table1[0].euro &&
          res.table1[0][9] === specialCharData.table1[0].banghash &&
          res.table1[0][10] === specialCharData.table1[0].dot
        )
      }
    },
    {
      title: 'Other special characters',
      description: 'Should handle other special characters',
      test: () => {
        return adapter.request('common/sendArr', moreSpecialCharData)
      },
      assertion: (res: any) => {
        return (
          res.table1[0][0] === moreSpecialCharData.table1[0].speech0 &&
          res.table1[0][1] === moreSpecialCharData.table1[0].pct &&
          res.table1[0][2] === moreSpecialCharData.table1[0].speech &&
          res.table1[0][3] === moreSpecialCharData.table1[0].slash &&
          res.table1[0][4] === moreSpecialCharData.table1[0].slashWithSpecial &&
          res.table1[0][5] === moreSpecialCharData.table1[0].macvar &&
          res.table1[0][6] === moreSpecialCharData.table1[0].chinese &&
          res.table1[0][7] === moreSpecialCharData.table1[0].sigma &&
          res.table1[0][8] === moreSpecialCharData.table1[0].at &&
          res.table1[0][9] === moreSpecialCharData.table1[0].serbian &&
          res.table1[0][10] === moreSpecialCharData.table1[0].dollar
        )
      }
    },
    {
      title: 'Wide table with sendArr',
      description: 'Should handle data with 10000 columns',
      test: () => {
        return adapter.request('common/sendArr', getWideData())
      },
      assertion: (res: any) => {
        const data = getWideData()
        let result = true
        for (let i = 0; i <= 10; i++) {
          result =
            result && res.table1[0][i] === data.table1[0]['col' + (i + 1)]
        }
        return result
      }
    },
    {
      title: 'Wide table with sendObj',
      description: 'Should handle data with 10000 columns',
      test: () => {
        return adapter.request('common/sendObj', getWideData())
      },
      assertion: (res: any) => {
        const data = getWideData()
        let result = true
        for (let i = 0; i <= 10; i++) {
          result =
            result &&
            res.table1[0]['COL' + (i + 1)] === data.table1[0]['col' + (i + 1)]
        }
        return result
      }
    },
    {
      title: 'Multiple tables',
      description: 'Should handle data with 100 tables',
      test: () => {
        return adapter.request('common/sendArr', getTables())
      },
      assertion: (res: any) => {
        const data = getTables()
        return (
          res.table1[0][0] === data.table1[0].col1 &&
          res.table1[0][1] === data.table1[0].col2 &&
          res.table1[0][2] === data.table1[0].col3 &&
          res.table1[0][3] === data.table1[0].col4 &&
          res.table50[0][0] === data.table50[0].col1 &&
          res.table50[0][1] === data.table50[0].col2 &&
          res.table50[0][2] === data.table50[0].col3 &&
          res.table50[0][3] === data.table50[0].col4
        )
      }
    },
    {
      title: 'Large dataset with sendObj',
      description: 'Should handle 5mb of data',
      test: () => {
        return adapter.request('common/sendObj', getLargeDataset())
      },
      assertion: (res: any) => {
        const data = getLargeDataset()
        let result = true
        for (let i = 0; i <= 10; i++) {
          result = result && res.table1[i][0] === data.table1[i][0]
        }
        return result
      }
    },
    {
      title: 'Large dataset with sendArr',
      description: 'Should handle 5mb of data',
      test: () => {
        return adapter.request('common/sendArr', getLargeDataset())
      },
      assertion: (res: any) => {
        const data = getLargeDataset()
        let result = true
        for (let i = 0; i <= 10; i++) {
          result =
            result && res.table1[i][0] === Object.values(data.table1[i])[0]
        }
        return result
      }
    },
    {
      title: 'Error and _csrf tables with sendArr',
      description: 'Should handle error and _csrf tables',
      test: () => {
        return adapter.request('common/sendArr', errorAndCsrfData)
      },
      assertion: (res: any) => {
        return (
          res.error[0][0] === errorAndCsrfData.error[0].col1 &&
          res.error[0][1] === errorAndCsrfData.error[0].col2 &&
          res.error[0][2] === errorAndCsrfData.error[0].col3 &&
          res.error[0][3] === errorAndCsrfData.error[0].col4 &&
          res._csrf[0][0] === errorAndCsrfData._csrf[0].col1 &&
          res._csrf[0][1] === errorAndCsrfData._csrf[0].col2 &&
          res._csrf[0][2] === errorAndCsrfData._csrf[0].col3 &&
          res._csrf[0][3] === errorAndCsrfData._csrf[0].col4
        )
      }
    },
    {
      title: 'Error and _csrf tables with sendObj',
      description: 'Should handle error and _csrf tables',
      test: () => {
        return adapter.request('common/sendObj', errorAndCsrfData)
      },
      assertion: (res: any) => {
        return (
          res.error[0].COL1 === errorAndCsrfData.error[0].col1 &&
          res.error[0].COL2 === errorAndCsrfData.error[0].col2 &&
          res.error[0].COL3 === errorAndCsrfData.error[0].col3 &&
          res.error[0].COL4 === errorAndCsrfData.error[0].col4 &&
          res._csrf[0].COL1 === errorAndCsrfData._csrf[0].col1 &&
          res._csrf[0].COL2 === errorAndCsrfData._csrf[0].col2 &&
          res._csrf[0].COL3 === errorAndCsrfData._csrf[0].col3 &&
          res._csrf[0].COL4 === errorAndCsrfData._csrf[0].col4
        )
      }
    },
    {
      title: 'Request with extra attributes on JES approach',
      description:
        'Should complete successful request with extra attributes present in response',
      test: async () => {
        if (adapter.getSasjsConfig().serverType !== 'SASVIYA')
          return Promise.resolve('skip')

        const config = {
          useComputeApi: false
        }

        return await adapter.request(
          'common/sendArr',
          stringData,
          config,
          undefined,
          undefined,
          ['file', 'data']
        )
      },
      assertion: (response: any) => {
        if (response === 'skip') return true

        const responseKeys: any = Object.keys(response)
        return responseKeys.includes('file') && responseKeys.includes('data')
      }
    }
  ]
})
