export function chunkMessage(text: string, maxLength: number = 4000): string[] {
  if (maxLength <= 0) {
    throw new Error('maxLength must be greater than 0');
  }

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const sentences = normalized.match(/[^.!?]+[.!?]+|\S+$/g) ?? [normalized];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence.trim()}` : sentence.trim();
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (sentence.trim().length <= maxLength) {
      current = sentence.trim();
      continue;
    }

    const words = sentence.trim().split(/\s+/);
    let wordChunk = '';
    for (const word of words) {
      const wordCandidate = wordChunk ? `${wordChunk} ${word}` : word;
      if (wordCandidate.length <= maxLength) {
        wordChunk = wordCandidate;
      } else {
        if (wordChunk) {
          chunks.push(wordChunk);
        }
        if (word.length > maxLength) {
          for (let index = 0; index < word.length; index += maxLength) {
            chunks.push(word.slice(index, index + maxLength));
          }
          wordChunk = '';
        } else {
          wordChunk = word;
        }
      }
    }

    current = wordChunk;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.filter((chunk) => chunk.length > 0);
}
