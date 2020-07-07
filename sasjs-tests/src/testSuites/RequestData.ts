import SASjs from "sasjs";
import { TestSuite } from "../types";

const stringData: any = { table1: [{ col1: "first col value" }] };
const numericData: any = { table1: [{ col1: 3.14159265 }] };
const multiColumnData: any = {
  table1: [{ col1: 42, col2: 1.618, col3: "x", col4: "x" }],
};
const multipleRowsWithNulls: any = {
  table1: [
    { col1: 42, col2: null, col3: "x", col4: "" },
    { col1: 42, col2: null, col3: "x", col4: "" },
    { col1: 42, col2: null, col3: "x", col4: "" },
    { col1: 42, col2: 1.62, col3: "x", col4: "x" },
    { col1: 42, col2: 1.62, col3: "x", col4: "x" },
  ],
};
const multipleColumnsWithNulls: any = {
  table1: [
    { col1: 42, col2: null, col3: "x", col4: null },
    { col1: 42, col2: null, col3: "x", col4: null },
    { col1: 42, col2: null, col3: "x", col4: null },
    { col1: 42, col2: null, col3: "x", col4: "" },
    { col1: 42, col2: null, col3: "x", col4: "" },
  ],
};

const getLongStringData = (length = 32764) => {
  let x = "X";
  for (let i = 1; i <= length; i++) {
    x = x + "X";
  }
  const data: any = { table1: [{ col1: x }] };
  return data;
};

const getLargeObjectData = () => {
  const data = { table1: [{ big: "data" }] };

  for (let i = 1; i < 10000; i++) {
    data.table1.push(data.table1[0]);
  }

  return data;
};

export const sendArrTests = (adapter: SASjs): TestSuite => ({
  name: "sendArr",
  tests: [
    {
      title: "Single string value",
      description: "Should send an array with a single string value",
      test: () => {
        return adapter.request("common/sendArr", stringData);
      },
      assertion: (res: any) => {
        return res.table1[0][0] === stringData.table1[0].col1;
      },
    },
    {
      title: "Long string value",
      description:
        "Should send an array with a long string value under 32765 characters",
      test: () => {
        return adapter.request("common/sendArr", getLongStringData());
      },
      assertion: (res: any) => {
        const longStringData = getLongStringData();
        return res.table1[0][0] === longStringData.table1[0].col1;
      },
    },
    {
      title: "Overly long string value",
      description:
        "Should error out with long string values over 32765 characters",
      test: () => {
        return adapter
          .request("common/sendArr", getLongStringData(32767))
          .catch((e) => e);
      },
      assertion: (error: any) => {
        return !!error && !!error.MESSAGE;
      },
    },
    {
      title: "Single numeric value",
      description: "Should send an array with a single numeric value",
      test: () => {
        return adapter.request("common/sendArr", numericData);
      },
      assertion: (res: any) => {
        return res.table1[0][0] === numericData.table1[0].col1;
      },
    },
    {
      title: "Multiple columns",
      description: "Should handle data with multiple columns",
      test: () => {
        return adapter.request("common/sendArr", multiColumnData);
      },
      assertion: (res: any) => {
        return (
          res.table1[0][0] === multiColumnData.table1[0].col1 &&
          res.table1[0][1] === multiColumnData.table1[0].col2 &&
          res.table1[0][2] === multiColumnData.table1[0].col3 &&
          res.table1[0][3] === multiColumnData.table1[0].col4
        );
      },
    },
    {
      title: "Multiple rows with nulls",
      description: "Should handle data with multiple rows with null values",
      test: () => {
        return adapter.request("common/sendArr", multipleRowsWithNulls);
      },
      assertion: (res: any) => {
        let result = true;
        multipleRowsWithNulls.table1.forEach((_: any, index: number) => {
          result =
            result &&
            res.table1[index][0] === multipleRowsWithNulls.table1[index].col1;
          result =
            result &&
            res.table1[index][1] === multipleRowsWithNulls.table1[index].col2;
          result =
            result &&
            res.table1[index][2] === multipleRowsWithNulls.table1[index].col3;
          result =
            result &&
            res.table1[index][3] === multipleRowsWithNulls.table1[index].col4;
        });
        return result;
      },
    },
    {
      title: "Multiple columns with nulls",
      description: "Should handle data with multiple columns with null values",
      test: () => {
        return adapter.request("common/sendArr", multipleColumnsWithNulls);
      },
      assertion: (res: any) => {
        let result = true;
        multipleColumnsWithNulls.table1.forEach((_: any, index: number) => {
          result =
            result &&
            res.table1[index][0] ===
              multipleColumnsWithNulls.table1[index].col1;
          result =
            result &&
            res.table1[index][1] ===
              multipleColumnsWithNulls.table1[index].col2;
          result =
            result &&
            res.table1[index][2] ===
              multipleColumnsWithNulls.table1[index].col3;
          result =
            result &&
            res.table1[index][3] ===
              (multipleColumnsWithNulls.table1[index].col4 || "");
        });
        return result;
      },
    },
  ],
});

export const sendObjTests = (adapter: SASjs): TestSuite => ({
  name: "sendObj",
  tests: [
    {
      title: "Invalid column name",
      description: "Should throw an error",
      test: async () => {
        const invalidData: any = {
          "1 invalid table": [{ col1: 42 }],
        };
        return adapter.request("common/sendObj", invalidData).catch((e) => e);
      },
      assertion: (error: any) => !!error && !!error.MESSAGE,
    },
    {
      title: "Single string value",
      description: "Should send an object with a single string value",
      test: () => {
        return adapter.request("common/sendObj", stringData);
      },
      assertion: (res: any) => {
        return res.table1[0].COL1 === stringData.table1[0].col1;
      },
    },
    {
      title: "Long string value",
      description:
        "Should send an object with a long string value under 32765 characters",
      test: () => {
        return adapter.request("common/sendObj", getLongStringData());
      },
      assertion: (res: any) => {
        const longStringData = getLongStringData();
        return res.table1[0].COL1 === longStringData.table1[0].col1;
      },
    },
    {
      title: "Overly long string value",
      description:
        "Should error out with long string values over 32765 characters",
      test: () => {
        return adapter
          .request("common/sendObj", getLongStringData(32767))
          .catch((e) => e);
      },
      assertion: (error: any) => {
        return !!error && !!error.MESSAGE;
      },
    },
    {
      title: "Single numeric value",
      description: "Should send an object with a single numeric value",
      test: () => {
        return adapter.request("common/sendObj", numericData);
      },
      assertion: (res: any) => {
        return res.table1[0].COL1 === numericData.table1[0].col1;
      },
    },

    {
      title: "Large data volume",
      description: "Should send an object with a large amount of data",
      test: () => {
        return adapter.request("common/sendObj", getLargeObjectData());
      },
      assertion: (res: any) => {
        const data = getLargeObjectData();
        return res.table1[9000].BIG === data.table1[9000].big;
      },
    },
    {
      title: "Multiple columns",
      description: "Should handle data with multiple columns",
      test: () => {
        return adapter.request("common/sendObj", multiColumnData);
      },
      assertion: (res: any) => {
        return (
          res.table1[0].COL1 === multiColumnData.table1[0].col1 &&
          res.table1[0].COL2 === multiColumnData.table1[0].col2 &&
          res.table1[0].COL3 === multiColumnData.table1[0].col3 &&
          res.table1[0].COL4 === multiColumnData.table1[0].col4
        );
      },
    },
    {
      title: "Multiple rows with nulls",
      description: "Should handle data with multiple rows with null values",
      test: () => {
        return adapter.request("common/sendObj", multipleRowsWithNulls);
      },
      assertion: (res: any) => {
        let result = true;
        multipleRowsWithNulls.table1.forEach((_: any, index: number) => {
          result =
            result &&
            res.table1[index].COL1 === multipleRowsWithNulls.table1[index].col1;
          result =
            result &&
            res.table1[index].COL2 === multipleRowsWithNulls.table1[index].col2;
          result =
            result &&
            res.table1[index].COL3 === multipleRowsWithNulls.table1[index].col3;
          result =
            result &&
            res.table1[index].COL4 === multipleRowsWithNulls.table1[index].col4;
        });
        return result;
      },
    },
    {
      title: "Multiple columns with nulls",
      description: "Should handle data with multiple columns with null values",
      test: () => {
        return adapter.request("common/sendObj", multipleColumnsWithNulls);
      },
      assertion: (res: any) => {
        let result = true;
        multipleColumnsWithNulls.table1.forEach((_: any, index: number) => {
          result =
            result &&
            res.table1[index].COL1 ===
              multipleColumnsWithNulls.table1[index].col1;
          result =
            result &&
            res.table1[index].COL2 ===
              multipleColumnsWithNulls.table1[index].col2;
          result =
            result &&
            res.table1[index].COL3 ===
              multipleColumnsWithNulls.table1[index].col3;
          result =
            result &&
            res.table1[index].COL4 ===
              (multipleColumnsWithNulls.table1[index].col4 || "");
        });
        return result;
      },
    },
  ],
});
