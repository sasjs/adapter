export const assert = (
  expression: boolean | (() => boolean),
  message = "Assertion failed"
) => {
  let result;
  try {
    if (typeof expression === "boolean") {
      result = expression;
    } else {
      result = expression();
    }
  } catch (e) {
    console.error(message);
    throw new Error(message);
  }
  if (!!result) {
    return;
  } else {
    console.error(message);
    throw new Error(message);
  }
};
