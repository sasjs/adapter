/**
 * Converts the given JSON object to a CSV string.
 * @param data - the JSON object to convert.
 */
export const convertToCSV = (data: any) => {
  const replacer = (key: any, value: any) => (value === null ? "" : value);
  const headerFields = Object.keys(data[0]);
  let csvTest;
  let invalidString = false;
  const headers = headerFields.map((field) => {
    let firstFoundType: string | null = null;
    let hasMixedTypes: boolean = false;
    let rowNumError: number = -1;

    const longestValueForField = data
      .map((row: any, index: number) => {
        if (row[field] || row[field] === "") {
          if (firstFoundType) {
            let currentFieldType =
              row[field] === "" || typeof row[field] === "string"
                ? "chars"
                : "number";

            if (!hasMixedTypes) {
              hasMixedTypes = currentFieldType !== firstFoundType;
              rowNumError = hasMixedTypes ? index + 1 : -1;
            }
          } else {
            if (row[field] === "") {
              firstFoundType = "chars";
            } else {
              firstFoundType =
                typeof row[field] === "string" ? "chars" : "number";
            }
          }

          let byteSize;

          if (typeof row[field] === "string") {
            let doubleQuotesFound = row[field]
              .split("")
              .filter((char: any) => char === '"');

            byteSize = getByteSize(row[field]);

            if (doubleQuotesFound.length > 0) {
              byteSize += doubleQuotesFound.length;
            }
          }

          return byteSize;
        }
      })
      .sort((a: number, b: number) => b - a)[0];
    if (longestValueForField && longestValueForField > 32765) {
      invalidString = true;
    }
    if (hasMixedTypes) {
      console.error(
        `Row (${rowNumError}), Column (${field}) has mixed types: ERROR`
      );
    }

    return `${field}:${firstFoundType === "chars" ? "$" : ""}${
      longestValueForField
        ? longestValueForField
        : firstFoundType === "chars"
        ? "1"
        : "best"
    }.`;
  });

  if (invalidString) {
    return "ERROR: LARGE STRING LENGTH";
  }
  csvTest = data.map((row: any) => {
    const fields = Object.keys(row).map((fieldName, index) => {
      let value;
      let containsSpecialChar = false;
      const currentCell = row[fieldName];

      if (JSON.stringify(currentCell).search(/(\\t|\\n|\\r)/gm) > -1) {
        value = currentCell.toString();
        containsSpecialChar = true;
      } else {
        value = JSON.stringify(currentCell, replacer);
      }

      value = value.replace(/\\\\/gm, "\\");

      if (containsSpecialChar) {
        if (value.includes(",") || value.includes('"')) {
          value = '"' + value + '"';
        }
      } else {
        if (
          !value.includes(",") &&
          value.includes('"') &&
          !value.includes('\\"')
        ) {
          value = value.substring(1, value.length - 1);
        }

        value = value.replace(/\\"/gm, '""');
      }

      value = value.replace(/\r\n/gm, "\n");

      if (value === "" && headers[index].includes("best")) {
        value = ".";
      }

      return value;
    });
    return fields.join(",");
  });

  let finalCSV =
    headers.join(",").replace(/,/g, " ") + "\r\n" + csvTest.join("\r\n");

  return finalCSV;
};

const getByteSize = (str: string) => {
  let byteSize = str.length;
  for (let i = str.length - 1; i >= 0; i--) {
    const code = str.charCodeAt(i);
    if (code > 0x7f && code <= 0x7ff) byteSize++;
    else if (code > 0x7ff && code <= 0xffff) byteSize += 2;
    if (code >= 0xdc00 && code <= 0xdfff) i--; //trail surrogate
  }
  return byteSize;
};
