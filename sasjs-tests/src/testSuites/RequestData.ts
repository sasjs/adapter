/* eslint-disable @typescript-eslint/no-explicit-any */
import SASjs from '@sasjs/adapter'
import type { TestSuite } from '../types'

const stringData: any = { table1: [{ col1: 'first col value' }] }
const numericData: any = { table1: [{ col1: 3.14159265 }] }
const multiColumnData: any = {
  table1: [{ col1: 42, col2: 1.618, col3: 'x', col4: 'x' }]
}
const multipleRowsWithNulls: any = {
  table1: [
    { col1: 42, col2: null, col3: 'x', col4: '' },
    { col1: 42, col2: null, col3: 'x', col4: '' },
    { col1: 42, col2: null, col3: 'x', col4: '' },
    { col1: 42, col2: 1.62, col3: 'x', col4: 'x' },
    { col1: 42, col2: 1.62, col3: 'x', col4: 'x' }
  ]
}

const multipleColumnsWithNulls: any = {
  table1: [
    { col1: 42, col2: null, col3: 'x', col4: null },
    { col1: 42, col2: null, col3: 'x', col4: null },
    { col1: 42, col2: null, col3: 'x', col4: null },
    { col1: 42, col2: null, col3: 'x', col4: '' },
    { col1: 42, col2: null, col3: 'x', col4: '' }
  ]
}

/**
 * Fold every representation of a SAS missing value onto `null`.
 *
 * A blank is the missing value for a character column, and SAS pads a character
 * value to the width of the column - so a value sent as `null` or `''` comes
 * back as one or more spaces (Viya returns a single space for a length-1
 * column). A missing numeric comes back as `null`. Comparing the raw values
 * would assert the rendering of each platform rather than the round trip, so
 * both sides of a comparison go through here.
 */
const normaliseSasValue = (value: any) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return value
}

const getLongStringData = (length = 32764) => {
  let x = 'X'
  for (let i = 1; i <= length; i++) {
    x = x + 'X'
  }
  const data: any = { table1: [{ col1: x }] }
  return data
}

const getLargeObjectData = () => {
  const data = { table1: [{ big: 'data' }] }

  for (let i = 1; i < 10000; i++) {
    data.table1.push(data.table1[0])
  }

  return data
}

export const sendArrTests = (adapter: SASjs, appLoc: string): TestSuite => ({
  name: 'sendArr',
  tests: [
    {
      title: 'Absolute paths',
      description: 'Should work with absolute paths to SAS jobs',
      test: () => {
        return adapter.request(`${appLoc}/services/common/sendArr`, stringData)
      },
      assertion: (res: any) => {
        return res.table1[0][0] === stringData.table1[0].col1
      }
    },
    {
      title: 'Single string value',
      description: 'Should send an array with a single string value',
      test: () => {
        return adapter.request('services/common/sendArr', stringData)
      },
      assertion: (res: any) => {
        return res.table1[0][0] === stringData.table1[0].col1
      }
    },
    {
      title: 'Long string value',
      description:
        'Should send an array with a long string value under 32765 characters',
      test: () => {
        return adapter.request('services/common/sendArr', getLongStringData())
      },
      assertion: (res: any) => {
        const longStringData = getLongStringData()
        return res.table1[0][0] === longStringData.table1[0].col1
      }
    },
    {
      title: 'Overly long string value',
      description:
        'Should error out with long string values over 32765 characters',
      test: () => {
        const data = getLongStringData(32767)
        return adapter
          .request('services/common/sendArr', data)
          .catch((e: any) => e)
      },
      assertion: (error: any) => {
        return !!error && !!error.error && !!error.error.message
      }
    },
    {
      title: 'Single numeric value',
      description: 'Should send an array with a single numeric value',
      test: () => {
        return adapter.request('services/common/sendArr', numericData)
      },
      assertion: (res: any) => {
        return res.table1[0][0] === numericData.table1[0].col1
      }
    },
    {
      title: 'Multiple columns',
      description: 'Should handle data with multiple columns',
      test: () => {
        return adapter.request('services/common/sendArr', multiColumnData)
      },
      assertion: (res: any) => {
        return (
          res.table1[0][0] === multiColumnData.table1[0].col1 &&
          res.table1[0][1] === multiColumnData.table1[0].col2 &&
          res.table1[0][2] === multiColumnData.table1[0].col3 &&
          res.table1[0][3] === multiColumnData.table1[0].col4
        )
      }
    },
    {
      title: 'Multiple rows with nulls',
      description: 'Should handle data with multiple rows with null values',
      test: () => {
        return adapter.request('services/common/sendArr', multipleRowsWithNulls)
      },
      assertion: (res: any) => {
        let result = true
        multipleRowsWithNulls.table1.forEach((row: any, index: number) => {
          const got = res.table1[index]
          result =
            result && normaliseSasValue(got[0]) === normaliseSasValue(row.col1)
          result =
            result && normaliseSasValue(got[1]) === normaliseSasValue(row.col2)
          result =
            result && normaliseSasValue(got[2]) === normaliseSasValue(row.col3)
          result =
            result && normaliseSasValue(got[3]) === normaliseSasValue(row.col4)
        })
        return result
      }
    },
    {
      title: 'Multiple columns with nulls',
      description: 'Should handle data with multiple columns with null values',
      test: () => {
        return adapter.request(
          'services/common/sendArr',
          multipleColumnsWithNulls
        )
      },
      assertion: (res: any) => {
        let result = true
        multipleColumnsWithNulls.table1.forEach((row: any, index: number) => {
          const got = res.table1[index]
          result =
            result && normaliseSasValue(got[0]) === normaliseSasValue(row.col1)
          result =
            result && normaliseSasValue(got[1]) === normaliseSasValue(row.col2)
          result =
            result && normaliseSasValue(got[2]) === normaliseSasValue(row.col3)
          result =
            result && normaliseSasValue(got[3]) === normaliseSasValue(row.col4)
        })
        return result
      }
    }
  ]
})

export const sendObjTests = (adapter: SASjs): TestSuite => ({
  name: 'sendObj',
  tests: [
    {
      title: 'Table name starts with numeric',
      description: 'Should throw an error',
      test: async () => {
        const invalidData: any = {
          '1InvalidTable': [{ col1: 42 }]
        }
        return adapter
          .request('services/common/sendObj', invalidData)
          .catch((e: any) => e)
      },
      assertion: (error: any) =>
        !!error && !!error.error && !!error.error.message
    },
    {
      title: 'Table name contains a space',
      description: 'Should throw an error',
      test: async () => {
        const invalidData: any = {
          'an invalidTable': [{ col1: 42 }]
        }
        return adapter
          .request('services/common/sendObj', invalidData)
          .catch((e: any) => e)
      },
      assertion: (error: any) =>
        !!error && !!error.error && !!error.error.message
    },
    {
      title: 'Table name contains a special character',
      description: 'Should throw an error',
      test: async () => {
        const invalidData: any = {
          'anInvalidTable#': [{ col1: 42 }]
        }
        return adapter
          .request('services/common/sendObj', invalidData)
          .catch((e: any) => e)
      },
      assertion: (error: any) =>
        !!error && !!error.error && !!error.error.message
    },
    {
      title: 'Table name exceeds max length of 32 characters',
      description: 'Should throw an error',
      test: async () => {
        const invalidData: any = {
          xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx: [{ col1: 42 }]
        }

        return adapter
          .request('services/common/sendObj', invalidData)
          .catch((e: any) => e)
      },
      assertion: (error: any) =>
        !!error && !!error.error && !!error.error.message
    },
    {
      title: "Invalid data object's structure",
      description: 'Should throw an error',
      test: async () => {
        const invalidData: any = {
          inData: [[{ data: 'value' }]]
        }
        return adapter
          .request('services/common/sendObj', invalidData)
          .catch((e: any) => e)
      },
      assertion: (error: any) =>
        !!error && !!error.error && !!error.error.message
    },
    {
      title: 'Single string value',
      description: 'Should send an object with a single string value',
      test: () => {
        return adapter.request('services/common/sendObj', stringData)
      },
      assertion: (res: any) => {
        return res.table1[0].COL1 === stringData.table1[0].col1
      }
    },
    {
      title: 'Long string value',
      description:
        'Should send an object with a long string value under 32765 characters',
      test: () => {
        return adapter.request('services/common/sendObj', getLongStringData())
      },
      assertion: (res: any) => {
        const longStringData = getLongStringData()
        return res.table1[0].COL1 === longStringData.table1[0].col1
      }
    },
    {
      title: 'Overly long string value',
      description:
        'Should error out with long string values over 32765 characters',
      test: () => {
        return adapter
          .request('services/common/sendObj', getLongStringData(32767))
          .catch((e: any) => e)
      },
      assertion: (error: any) => {
        return !!error && !!error.error && !!error.error.message
      }
    },
    {
      title: 'Single numeric value',
      description: 'Should send an object with a single numeric value',
      test: () => {
        return adapter.request('services/common/sendObj', numericData)
      },
      assertion: (res: any) => {
        return res.table1[0].COL1 === numericData.table1[0].col1
      }
    },

    {
      title: 'Large data volume',
      description: 'Should send an object with a large amount of data',
      test: () => {
        return adapter.request('services/common/sendObj', getLargeObjectData())
      },
      assertion: (res: any) => {
        const data = getLargeObjectData()
        return res.table1[9000].BIG === data.table1[9000].big
      }
    },
    {
      title: 'Multiple columns',
      description: 'Should handle data with multiple columns',
      test: () => {
        return adapter.request('services/common/sendObj', multiColumnData)
      },
      assertion: (res: any) => {
        return (
          res.table1[0].COL1 === multiColumnData.table1[0].col1 &&
          res.table1[0].COL2 === multiColumnData.table1[0].col2 &&
          res.table1[0].COL3 === multiColumnData.table1[0].col3 &&
          res.table1[0].COL4 === multiColumnData.table1[0].col4
        )
      }
    },
    {
      title: 'Multiple rows with nulls',
      description: 'Should handle data with multiple rows with null values',
      test: () => {
        return adapter.request('services/common/sendObj', multipleRowsWithNulls)
      },
      assertion: (res: any) => {
        let result = true
        multipleRowsWithNulls.table1.forEach((row: any, index: number) => {
          const got = res.table1[index]
          result =
            result &&
            normaliseSasValue(got.COL1) === normaliseSasValue(row.col1)
          result =
            result &&
            normaliseSasValue(got.COL2) === normaliseSasValue(row.col2)
          result =
            result &&
            normaliseSasValue(got.COL3) === normaliseSasValue(row.col3)
          result =
            result &&
            normaliseSasValue(got.COL4) === normaliseSasValue(row.col4)
        })
        return result
      }
    },
    {
      title: 'Multiple columns with nulls',
      description: 'Should handle data with multiple columns with null values',
      test: () => {
        return adapter.request(
          'services/common/sendObj',
          multipleColumnsWithNulls
        )
      },
      assertion: (res: any) => {
        let result = true
        multipleColumnsWithNulls.table1.forEach((row: any, index: number) => {
          const got = res.table1[index]
          result =
            result &&
            normaliseSasValue(got.COL1) === normaliseSasValue(row.col1)
          result =
            result &&
            normaliseSasValue(got.COL2) === normaliseSasValue(row.col2)
          result =
            result &&
            normaliseSasValue(got.COL3) === normaliseSasValue(row.col3)
          result =
            result &&
            normaliseSasValue(got.COL4) === normaliseSasValue(row.col4)
        })
        return result
      }
    }
  ]
})
