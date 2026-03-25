export interface ProgressMessage {
  message_key: string;
  chat_id: string;
  text: string;
}

export function parseProgressMessage(payload: unknown): ProgressMessage | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Partial<ProgressMessage>;
  if (
    typeof candidate.message_key !== 'string' ||
    typeof candidate.chat_id !== 'string' ||
    typeof candidate.text !== 'string'
  ) {
    return null;
  }

  return {
    message_key: candidate.message_key,
    chat_id: candidate.chat_id,
    text: candidate.text,
  };
}
