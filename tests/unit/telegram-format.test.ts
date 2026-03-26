import { describe, expect, it } from 'vitest';

import { formatTelegramHtml } from '../../src/services/telegram-format.js';

describe('formatTelegramHtml', () => {
  it('converts basic markdown into html', () => {
    expect(formatTelegramHtml('**bold** _italic_ ~~strike~~')).toBe(
      '<b>bold</b> <i>italic</i> <s>strike</s>'
    );
  });

  it('escapes html special chars', () => {
    expect(formatTelegramHtml('<tag> & value')).toBe('&lt;tag&gt; &amp; value');
  });
});
