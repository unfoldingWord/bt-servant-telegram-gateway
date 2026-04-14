export function formatEngineResponse(text: string): string {
  const normalized = normalizeWhitespace(text);

  return normalized
    .replace(/\n{2,}---\n{2,}/gu, '\n\n')
    .replace(/\n{2,}---\n/gu, '\n\n')
    .replace(/\n---\n{2,}/gu, '\n\n')
    .replace(/\n---\n/gu, '\n\n')
    .replace(/\n{3,}/gu, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n');
}
