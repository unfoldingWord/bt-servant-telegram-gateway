export interface ProgressMessage {
  type?: string;
  message_key: string;
  chat_id: string;
  text: string;
}

export function parseProgressMessage(payload: unknown): ProgressMessage | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Partial<ProgressMessage>;
  const type = typeof candidate.type === 'string' ? candidate.type : undefined;
  if (type !== 'complete') {
    return null;
  }

  const text = extractProgressText(payload);
  if (
    typeof candidate.message_key !== 'string' ||
    typeof candidate.chat_id !== 'string' ||
    typeof text !== 'string' ||
    text.trim().length === 0
  ) {
    return null;
  }

  return {
    type,
    message_key: candidate.message_key,
    chat_id: candidate.chat_id,
    text,
  };
}

function extractProgressText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.text === 'string' && candidate.text.trim()) {
    return candidate.text.trim();
  }

  if (candidate.response && typeof candidate.response === 'object') {
    const response = candidate.response as Record<string, unknown>;
    const responses = response.responses;
    if (Array.isArray(responses)) {
      const first = responses.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (first) {
        return first.trim();
      }
    }

    for (const key of ['response', 'message', 'text', 'reply', 'output', 'result']) {
      const value = response[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return '';
}
