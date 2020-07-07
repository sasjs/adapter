export const parseSasViyaLog = (logResponse: { items: any[] }) => {
  let log;
  try {
    log = logResponse.items
      ? logResponse.items.map((i) => i.line).join("\n")
      : JSON.stringify(logResponse);
  } catch (e) {
    console.error("An error has occurred while parsing the log response", e);
    log = logResponse;
  }
  return log;
};
