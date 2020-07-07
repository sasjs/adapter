export const parseSourceCode = (log: string): string => {
  const isSourceCodeLine = (line: string) =>
    line.trim().substring(0, 10).trimStart().match(/^\d/);
  const logLines = log.split("\n").filter(isSourceCodeLine);
  return logLines.join("\r\n");
};
