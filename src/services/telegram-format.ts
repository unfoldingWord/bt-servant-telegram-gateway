export function formatTelegramHtml(text: string): string {
  const placeholders = new Map<string, string>();
  let working = text;

  working = replaceWithPlaceholder(working, /\*\*(.+?)\*\*/gs, '<b>$1</b>', placeholders);
  working = replaceWithPlaceholder(working, /~~(.+?)~~/gs, '<s>$1</s>', placeholders);
  working = replaceWithPlaceholder(working, /\*(.+?)\*/gs, '<i>$1</i>', placeholders);
  working = replaceWithPlaceholder(working, /_(.+?)_/gs, '<i>$1</i>', placeholders);

  const escaped = escapeHtml(working);

  let rendered = escaped;
  for (const [token, html] of placeholders) {
    rendered = rendered.replaceAll(token, html);
  }

  return rendered;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceWithPlaceholder(
  text: string,
  pattern: RegExp,
  replacement: string,
  placeholders: Map<string, string>
): string {
  return text.replace(pattern, (_, inner: string) => {
    const token = `@@TGHTML${placeholders.size}@@`;
    placeholders.set(token, replacement.replace('$1', inner));
    return token;
  });
}
