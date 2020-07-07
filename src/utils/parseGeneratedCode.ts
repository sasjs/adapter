export const parseGeneratedCode = (log: string) => {
  const startsWith = "MPRINT";
  const isGeneratedCodeLine = (line: string) =>
    line.trim().startsWith(startsWith);
  const logLines = log.split("\n").filter(isGeneratedCodeLine);
  return logLines.join("\r\n");
};
