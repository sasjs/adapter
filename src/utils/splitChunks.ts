export const splitChunks = (content: string) => { // TODO: set return type
  const size = 16000; // why 16000?

  const numChunks = Math.ceil(content.length / size);
  const chunks = new Array(numChunks);

  for (let i = 0, o = 0; i < numChunks; ++i, o += size) { // FIXME: name variables properly
    chunks[i] = content.substr(o, size);
  }

  return chunks;
};
