export function chunkMessage(text: string, maxLength: number = 4000): string[] {
  if (maxLength <= 0) {
    throw new Error('maxLength must be greater than 0');
  }

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/g)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const segments = paragraphs.flatMap((paragraph) => expandParagraph(paragraph, maxLength));
  const chunks: string[] = [];
  let current = '';

  for (const segment of segments) {
    const candidate = current
      ? `${current}${segment.separator === 'blank' ? '\n\n' : ' '}${segment.text}`
      : segment.text;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (segment.text.length <= maxLength) {
      current = segment.text;
      continue;
    }

    const words = segment.text.split(/\s+/);
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

type Segment = {
  text: string;
  separator: 'blank' | 'space';
};

function expandParagraph(paragraph: string, maxLength: number): Segment[] {
  if (paragraph.length <= maxLength) {
    return [{ text: paragraph, separator: 'blank' }];
  }

  const hasSentencePunctuation = /[.!?]/u.test(paragraph);
  if (hasSentencePunctuation) {
    const matchedSentences = paragraph
      .match(/[^.!?]+[.!?]+|[^.!?]+$/gu)
      ?.map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);

    if (matchedSentences && matchedSentences.length > 0) {
      return matchedSentences.map((text, index) => ({
        text,
        separator: index === 0 ? 'blank' : 'space',
      }));
    }
  }

  return paragraph.split(/\s+/u).reduce<Segment[]>((acc, word, index) => {
    if (index === 0) {
      return [{ text: word, separator: 'blank' }];
    }

    return [...acc, { text: word, separator: 'space' }];
  }, []);
}
