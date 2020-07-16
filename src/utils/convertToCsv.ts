/**
 * Converts the given JSON object to a CSV string.
 * @param data - the JSON object to convert.
 */
export const convertToCSV = (data: any) => {
  const replacer = (key: any, value: any) => (value === null ? "" : value); // FIXME: 'key' parameter was not used, why do we compare with null (undefined, NaN)?
  const headerFields = Object.keys(data[0]); // FIXME: data can be of any type, but we are working with it as with object
  let csvTest;
  let invalidString = false;
  const headers = headerFields.map((field) => {
    let firstFoundType: string | null = null;
    let hasMixedTypes: boolean = false; // FIXME: unnecessary type declaration
    let rowNumError: number = -1; // FIXME: unnecessary type declaration

    const longestValueForField = data
      .map((row: any, index: number) => { // FIXME: row should be of type string | number
        if (row[field] || row[field] === "") {
          if (firstFoundType) {
            let currentFieldType = // FIXME: use const
              row[field] === "" || typeof row[field] === "string" // FIXME: "" is also of type string
                ? "chars"
                : "number";

            if (!hasMixedTypes) {
              hasMixedTypes = currentFieldType !== firstFoundType;
              rowNumError = hasMixedTypes ? index + 1 : -1; // TODO: refactor
            }
          } else {
            if (row[field] === "") {
              firstFoundType = "chars";
            } else {
              firstFoundType =
                typeof row[field] === "string" ? "chars" : "number"; // TODO: refactor
            }
          }

          let byteSize;

          if (typeof row[field] === "string") {
            let doubleQuotesFound = row[field] // FIXME: use const
              .split("")
              .filter((char: any) => char === '"'); // FIXME: why char is of type any?

            byteSize = getByteSize(row[field]);

            if (doubleQuotesFound.length > 0) {
              byteSize += doubleQuotesFound.length;
            }
          }

          return byteSize;
        }
      })
      .sort((a: number, b: number) => b - a)[0];

    if (longestValueForField && longestValueForField > 32765) { // FIXME: longestValueForField is an array and it is not comparable to a number
      invalidString = true;
    }

    if (hasMixedTypes) {
      console.error(
        `Row (${rowNumError}), Column (${field}) has mixed types: ERROR`
      );
    }

    return `${field}:${firstFoundType === "chars" ? "$" : ""}${ // TODO: format return string before return statement
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
      let containsSpecialChar = false; // FIXME: should be const
      const currentCell = row[fieldName];

      if (JSON.stringify(currentCell).search(/(\\t|\\n|\\r)/gm) > -1) {
        value = currentCell.toString();
        containsSpecialChar = true;
      } else {
        value = JSON.stringify(currentCell, replacer);
      }

      value = value.replace(/\\\\/gm, "\\");

      if (containsSpecialChar) {
        if (value.includes(",") || value.includes('"')) { // FIXME: use `"`
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

// TODO: refactor
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