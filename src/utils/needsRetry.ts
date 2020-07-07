export const needsRetry = (responseText: string): boolean => {
  return (
    (responseText.includes('"errorCode":403') &&
      responseText.includes("_csrf") &&
      responseText.includes("X-CSRF-TOKEN")) ||
    (responseText.includes('"status":403') &&
      responseText.includes('"error":"Forbidden"')) ||
    (responseText.includes('"status":449') &&
      responseText.includes("Authentication success, retry original request"))
  );
};
