import { describe, expect, it } from 'vitest';

import { formatEngineResponse } from '../../src/services/engine-response-format.js';

describe('formatEngineResponse', () => {
  it('normalizes section separators and spacing', () => {
    expect(formatEngineResponse('Hello\n\n---\n\nWorld')).toBe('Hello\n\nWorld');
  });

  it('preserves structured paragraphs and trims extra blank lines', () => {
    expect(formatEngineResponse('First line\n\n\nSecond line\n   \nThird line')).toBe(
      'First line\n\nSecond line\n\nThird line'
    );
  });
});
