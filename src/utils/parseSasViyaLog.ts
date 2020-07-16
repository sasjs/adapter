export const parseSasViyaLog = (logResponse: { items: any[] }) => { // TODO: be more specific on type declaration
  let log;

  try {
    log = logResponse.items
      ? logResponse.items.map((i) => i.line).join("\n")
      : JSON.stringify(logResponse);
  } catch (e) { // TODO: rename parameter to err or error
    console.error("An error has occurred while parsing the log response", e);

    log = logResponse;
  }

  return log;
};
