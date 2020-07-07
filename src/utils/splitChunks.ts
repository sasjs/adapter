export const splitChunks = (content: string) => {
  const size = 16000;

  const numChunks = Math.ceil(content.length / size);
  const chunks = new Array(numChunks);

  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = content.substr(o, size);
  }

  return chunks;
};
