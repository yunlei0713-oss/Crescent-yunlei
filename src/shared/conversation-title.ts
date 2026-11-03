/** Reference envelopes are storage metadata, not a human-facing conversation title. */
export function conversationTitleText(
  value: string | undefined,
  fallback = 'Conversation'
): string {
  let text = value?.trim() ?? ''
  if (text.startsWith('<!--crescent-refs:')) {
    const end = text.indexOf('-->')
    // Legacy titles may already have been cut off halfway through the envelope.
    text = end < 0 ? '' : text.slice(end + 3)
  }
  return text.replace(/\{\{@(?:wiki|skill|tool|path):[^}]+\}\}/g, '').trim() || fallback
}

export function conversationTitleFromMessage(value: string): string {
  return conversationTitleText(value).replace(/\s+/g, ' ').slice(0, 80)
}
