import { describe, expect, it } from 'vitest';

import { chunkMessage } from '../../src/services/chunking.js';

describe('chunkMessage', () => {
  it('returns empty array for blank input', () => {
    expect(chunkMessage('   ')).toEqual([]);
  });

  it('keeps short text in a single chunk', () => {
    expect(chunkMessage('Hello world. How are you?')).toEqual(['Hello world. How are you?']);
  });

  it('splits long text into bounded chunks', () => {
    const text = Array.from({ length: 200 }, (_, index) => `Sentence ${index + 1}.`).join(' ');

    const chunks = chunkMessage(text, 100);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('splits a single very long word', () => {
    const chunks = chunkMessage('a'.repeat(37), 10);

    expect(chunks).toEqual(['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaaaa']);
  });
});
